import { resolve4, resolve6 } from "node:dns/promises";
const API=(process.env.SMOKE_API_URL||"https://api.bravoshop.online").replace(/\/$/,"");
const MEDIA=(process.env.MEDIA_HEALTH_URL||"https://bravoshop-media-production.up.railway.app").replace(/\/$/,"");
async function request(path,options={}){
 const r=await fetch(API+path,{...options,headers:{accept:"application/json",...(options.headers||{})}});
 const body=await r.json().catch(()=>({}));
 return{status:r.status,ok:r.ok,body};
}
async function get(path){const r=await request(path);if(!r.ok)throw new Error(path+" "+r.status+": "+JSON.stringify(r.body));return r.body}
async function expectStatus(path,status,options={}){const r=await request(path,options);if(r.status!==status)throw new Error(path+" expected "+status+" got "+r.status+": "+JSON.stringify(r.body));return r.body}

const mediaResponse=await fetch(MEDIA+"/health",{headers:{accept:"application/json"}});
const mediaHealth=await mediaResponse.json().catch(()=>({}));
if(!mediaResponse.ok||mediaHealth.ok!==true||mediaHealth.storage!=="ready")throw new Error("Media health check failed: "+JSON.stringify(mediaHealth));

const plansPayload=await get("/api/public/plans");
const commercialPlans=Array.isArray(plansPayload.plans)?plansPayload.plans:[];
for(const slug of ["basic","premium"]){
 const plan=commercialPlans.find(x=>x.slug===slug);
 if(!plan||!Number.isFinite(Number(plan.monthly_price))||Number(plan.monthly_price)<=0||!Number.isFinite(Number(plan.annual_price))||Number(plan.annual_price)<=0||!/^[A-Z]{3}$/.test(String(plan.currency||"")))throw new Error("Commercial plans are missing, unpriced or invalid: "+slug);
}
const health=await get("/api/health");
if(health.ok!==true)throw new Error("Health check failed");
const ready=await get("/api/ready");
if(ready.ok!==true||ready.database!=="ready"||ready.schema!=="ready")throw new Error("Readiness check failed: "+JSON.stringify(ready));
if(!ready.integrations||ready.integrations.media!==true||typeof ready.integrations.payments!=="boolean"||typeof ready.integrations.notifications!=="boolean"||typeof ready.integrations.custom_domains!=="boolean")throw new Error("Integration readiness missing or invalid: "+JSON.stringify(ready.integrations));
const requireLive=process.env.REQUIRE_LIVE_INTEGRATIONS==="1";
if(requireLive&&(!ready.integrations.payments||!ready.integrations.notifications))throw new Error("Commercial integrations are not ready: "+JSON.stringify(ready.integrations));
const expected=process.env.EXPECTED_COMMIT_SHA||"";
if(expected&&ready.commit!==expected)throw new Error("Production commit mismatch: expected "+expected+" got "+(ready.commit||"none"));

// Non-destructive tenant-routing guards: reserved platform labels never resolve as stores,
// and a browser origin cannot select a different tenant through ?host=.
await expectStatus("/api/public/store?host="+encodeURIComponent("ftp.bravoshop.online"),404);
await expectStatus("/api/public/checkout/not-a-uuid",404);
await expectStatus(
 "/api/public/store?host="+encodeURIComponent("tenant-b.bravoshop.online"),
 400,
 {headers:{Origin:"https://tenant-a.bravoshop.online"}}
);

console.log(JSON.stringify({ok:true,health:health.ok,database:ready.database,schema:ready.schema,media:mediaHealth.storage,integrations:ready.integrations,commercial_gate:requireLive?"strict":"technical",commit:ready.commit||null,tenant_routing_guards:true}));

// DNS is a separate operational dependency: a healthy Railway service does not
// imply that newly provisioned merchant subdomains resolve publicly.
const storefrontHost=process.env.SMOKE_STOREFRONT_HOST||"mi-tienda-3.bravoshop.online";
const requireStorefrontDns=process.env.REQUIRE_STOREFRONT_DNS!=="0";
let storefrontDns="unverified";
try {
 const addresses=await Promise.any([resolve4(storefrontHost),resolve6(storefrontHost)]);
 if(!addresses.length)throw new Error("No DNS addresses returned");
 storefrontDns="resolved";
} catch(error) {
 storefrontDns="failed";
 if(requireStorefrontDns)throw new Error("Merchant storefront DNS failed for "+storefrontHost+": "+error.message);
 console.warn(JSON.stringify({warning:"MERCHANT_STOREFRONT_DNS_UNRESOLVED",hostname:storefrontHost}));
}
console.log(JSON.stringify({storefront_hostname:storefrontHost,storefront_dns:storefrontDns,strict_dns:requireStorefrontDns}));
