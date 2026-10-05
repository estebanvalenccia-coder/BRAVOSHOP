import assert from"node:assert/strict";
const API=(process.env.SMOKE_API_URL||"http://localhost:3001").replace(/\/$/,"");
const STORE_HOST=process.env.SMOKE_STORE_HOST||"smoke.bravoshop.online";
const stamp=Date.now();const email=`smoke+${stamp}@example.com`;const password="BravoShop-Smoke-123!";
let cookie="";
async function req(path,{method="GET",body}={}){const r=await fetch(API+path,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:"manual"});const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(data)}`);return data}
const health=await req("/api/health");assert.equal(health.ok,true);
const registered=await req("/api/auth/register",{method:"POST",body:{email,password,name:"Smoke Tester"}});assert.equal(registered.user.email,email);
const slug=`smoke-${stamp}`;const created=await req("/api/stores",{method:"POST",body:{name:"Smoke Store",slug,sector:"fashion",features:["catalog","checkout","orders","inventory"]}});assert.ok(created.store.id);
const product=await req(`/api/stores/${created.store.id}/products`,{method:"POST",body:{name:"Smoke Product",slug:"smoke-product",description:"Smoke test product",price:19.95,status:"active"}});assert.ok(product.product.id);
const variant=await req(`/api/stores/${created.store.id}/products/${product.product.id}/variants`,{method:"POST",body:{title:"Default",sku:`SMOKE-${stamp}`,price:19.95}});assert.ok(variant.variant.id);
await req(`/api/stores/${created.store.id}/variants/${variant.variant.id}/inventory`,{method:"PUT",body:{quantity:10,track_inventory:true}});
const store=await req(`/api/public/store?host=${encodeURIComponent(slug+".bravoshop.online")}`);assert.equal(store.store.slug,slug);
const products=await req(`/api/public/products?host=${encodeURIComponent(slug+".bravoshop.online")}`);assert.ok(products.products.some(p=>p.id===product.product.id));
const checkout=await req("/api/public/checkout",{method:"POST",body:{host:slug+".bravoshop.online",items:[{variant_id:variant.variant.id,quantity:2}],currency:"EUR"}});assert.equal(Number(checkout.checkout.total),39.9);
console.log(JSON.stringify({ok:true,store:slug,checkout:checkout.checkout.token},null,2));
