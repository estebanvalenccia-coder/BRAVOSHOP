import assert from"node:assert/strict";
const API=(process.env.SMOKE_API_URL||"http://localhost:3001").replace(/\/$/,"");
const stamp=Date.now();const password="BravoShop-Smoke-123!";
function client(){let cookie="";return async function req(path,{method="GET",body,expect}={}){const r=await fetch(API+path,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:"manual"});const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];const data=await r.json().catch(()=>({}));if(expect!==undefined){assert.equal(r.status,expect,`${method} ${path} expected ${expect}, got ${r.status}`);return data}if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);return data}}
const owner=client(),intruder=client();
const health=await owner("/api/health");assert.equal(health.ok,true);
const ownerEmail=`owner+${stamp}@example.com`;const intruderEmail=`intruder+${stamp}@example.com`;
await owner("/api/auth/register",{method:"POST",body:{email:ownerEmail,password,name:"Smoke Owner"}});
const slug=`smoke-${stamp}`;const created=await owner("/api/stores",{method:"POST",body:{name:"Smoke Store",slug,sector:"fashion",features:["catalog","checkout","orders","inventory"]}});assert.ok(created.store.id);
await intruder("/api/auth/register",{method:"POST",body:{email:intruderEmail,password,name:"Smoke Intruder"}});
await intruder(`/api/stores/${created.store.id}`,{expect:403});
const product=await owner(`/api/stores/${created.store.id}/products`,{method:"POST",body:{name:"Smoke Product",slug:"smoke-product",description:"Smoke test product",price:19.95,status:"active"}});assert.ok(product.product.id);
await intruder(`/api/stores/${created.store.id}/products`,{expect:403});
const variant=await owner(`/api/stores/${created.store.id}/products/${product.product.id}/variants`,{method:"POST",body:{title:"Default",sku:`SMOKE-${stamp}`,price:19.95}});assert.ok(variant.variant.id);
await owner(`/api/stores/${created.store.id}/variants/${variant.variant.id}/inventory`,{method:"PUT",body:{quantity:10,track_inventory:true}});
const store=await owner(`/api/public/store?host=${encodeURIComponent(slug+".bravoshop.online")}`);assert.equal(store.store.slug,slug);
const products=await owner(`/api/public/products?host=${encodeURIComponent(slug+".bravoshop.online")}`);assert.ok(products.products.some(p=>p.id===product.product.id));
const checkout=await owner("/api/public/checkout",{method:"POST",body:{host:slug+".bravoshop.online",items:[{variant_id:variant.variant.id,quantity:2}],currency:"EUR"}});assert.equal(Number(checkout.checkout.total),39.9);
console.log(JSON.stringify({ok:true,tenant_isolation:true,store:slug,checkout:checkout.checkout.token},null,2));
