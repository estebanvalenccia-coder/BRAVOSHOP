import { resolve4, resolve6, resolveCname, resolveNs } from "node:dns/promises";
import{inspectStorefrontShell}from"./storefrontShellCheck.js";
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
 // Separate wildcard/CNAME failures from a Railway target without A/AAAA.
 // Do not suppress this commercial launch blocker or guess at Cloudflare state.
 const target=process.env.SMOKE_STOREFRONT_TARGET||"dd9l9oj9.up.railway.app";
 const lookups=await Promise.allSettled([resolveCname(storefrontHost),resolve4(target),resolveNs("bravoshop.online")]);
 const diagnostics=Object.fromEntries(["merchant_cname","railway_target_ipv4","authoritative_nameservers"].map((name,i)=>{
  const r=lookups[i];return[name,r.status==="fulfilled"?r.value:({error:r.reason?.code||r.reason?.message||"UNKNOWN"})];
 }));
 console.error(JSON.stringify({warning:"MERCHANT_STOREFRONT_DNS_UNRESOLVED",hostname:storefrontHost,error:error.message,diagnostics}));
 if(requireStorefrontDns)throw new Error("Merchant storefront DNS failed for "+storefrontHost+": "+error.message+"; check CNAME, target and NS diagnostics above");
}
console.log(JSON.stringify({storefront_hostname:storefrontHost,storefront_dns:storefrontDns,strict_dns:requireStorefrontDns}));

const requireStorefrontHttps=process.env.REQUIRE_STOREFRONT_HTTPS!=="0";
async function checkStorefrontHttps(path){
 const url="https://"+storefrontHost+path;
 const response=await fetch(url,{headers:{Accept:"text/html","Cache-Control":"no-cache"},signal:AbortSignal.timeout(12000)});
 const body=await response.text();
 return inspectStorefrontShell({url:response.url,status:response.status,contentType:response.headers.get("content-type"),body},storefrontHost);
}
try{
 const main=await checkStorefrontHttps("/");
 const deepLink=await checkStorefrontHttps("/products/bravoshop-synthetic-link-probe");
 console.log(JSON.stringify({storefront_https:"ok",hostname:storefrontHost,homepage:main,deep_link:deepLink}));
}catch(error){
 if(requireStorefrontHttps)throw new Error("Merchant storefront HTTPS/SPA failed for "+storefrontHost+": "+error.message);
 console.warn(JSON.stringify({warning:"MERCHANT_STOREFRONT_HTTPS_UNVERIFIED",hostname:storefrontHost,reason:error.message}));
}
