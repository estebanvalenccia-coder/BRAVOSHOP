import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {merchantCheckoutReady} from "../src/platform/admin/merchantCheckoutReadiness.js";

const good={
 published:true,saleable_variants:1,checkout_features_ready:true,checkout_enabled:true,
 shipping_ready:true,legal_ready:true,payments_ready:true,notifications_ready:true
};
test("merchant ready-to-sell requires a published storefront, checkout and paid variant",()=>{
 assert.equal(merchantCheckoutReady(good,{publicable:true}),true);
 assert.equal(merchantCheckoutReady(good,{publicable:false}),false);
 for(const key of ["published","checkout_features_ready","checkout_enabled","shipping_ready","legal_ready","payments_ready","notifications_ready"]){
  assert.equal(merchantCheckoutReady({...good,[key]:false},{publicable:true}),false,key);
 }
 for(const saleable_variants of [0,null,undefined]){
  assert.equal(merchantCheckoutReady({...good,saleable_variants},{publicable:true}),false,String(saleable_variants));
 }
 assert.equal(merchantCheckoutReady({},{}),false);
});

test("commercial launch counts only actually sellable active variants",async()=>{
 const admin=await readFile(new URL("../server/routes/admin.js",import.meta.url),"utf8");
 const query=admin.slice(admin.indexOf('adminRouter.get("/launch/readiness"'),admin.indexOf('adminRouter.get("/summary"'));
 assert.match(query,/v\.active=true/);
 assert.match(query,/coalesce\(v\.price,p\.price\)>0/);
 assert.match(query,/coalesce\(il\.quantity,0\)-coalesce\(il\.reserved,0\)>0/);
 assert.match(query,/coalesce\(il\.allow_backorder,false\)=true/);
 assert.match(query,/coalesce\(il\.track_inventory,true\)=false/);
});

test("merchant dashboard reflects real Stripe account, inventory and platform kill switch",async()=>{
 const api=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 const ui=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 for(const required of [
  "saleable_variants:saleableVariants[0].value",
  "checkout_features_ready:checkoutModules[0].value===3",
  "checkout_enabled:checkoutControls.length===0||checkoutControls[0].enabled===true",
  'payment[0]?.provider==="stripe"&&payment[0]?.provider_account_id',
  "coalesce(il.quantity,0)-coalesce(il.reserved,0)>0"
 ])assert.ok(api.includes(required),required);
 assert.ok(ui.includes("merchantCheckoutReady(o,{publicable})"));
 assert.ok(ui.includes('label:"Escaparate publicado"'));
 assert.ok(ui.includes('label:"Checkout plataforma"'));
});
