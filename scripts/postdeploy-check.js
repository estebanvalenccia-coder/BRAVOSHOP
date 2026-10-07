const API=(process.env.SMOKE_API_URL||"https://api.bravoshop.online").replace(/\/$/,"");
async function get(path){const r=await fetch(API+path,{headers:{accept:"application/json"}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(path+" "+r.status+": "+JSON.stringify(body));return body}
const health=await get("/api/health");
if(health.ok!==true)throw new Error("Health check failed");
const ready=await get("/api/ready");
if(ready.ok!==true||ready.database!=="ready"||ready.schema!=="ready")throw new Error("Readiness check failed: "+JSON.stringify(ready));
console.log(JSON.stringify({ok:true,health:health.ok,database:ready.database,schema:ready.schema,migration:ready.migration||null}));
