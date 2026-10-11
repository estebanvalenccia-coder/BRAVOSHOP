import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {CORE_COMMERCE_FEATURES,coreCommerceFeaturesEnabled,publicCheckoutReadiness} from "../src/shared/commerceReadiness.js";

const all=CORE_COMMERCE_FEATURES.map(feature_key=>({feature_key,enabled:true}));
const good={features:all,checkoutEnabled:true,legalReady:true,notificationsReady:true,shippingReady:true,paymentsReady:true};

test("all three enabled modules are required to offer a checkout",()=>{
 assert.deepEqual([...CORE_COMMERCE_FEATURES],["catalog","cart","checkout"]);
 assert.equal(coreCommerceFeaturesEnabled(all),true);
 for(const key of CORE_COMMERCE_FEATURES){
  assert.equal(coreCommerceFeaturesEnabled(all.filter(x=>x.feature_key!==key)),false,key);
  assert.equal(coreCommerceFeaturesEnabled(all.map(x=>x.feature_key===key?{...x,enabled:false}:x)),false,key+" disabled");
 }
 assert.equal(coreCommerceFeaturesEnabled(null),false);
 assert.equal(coreCommerceFeaturesEnabled([{feature_key:"checkout",enabled:true}]),false);
 assert.equal(coreCommerceFeaturesEnabled([...all,{feature_key:"unknown",enabled:true}]),true);
});

test("storefront does not advertise commerce readiness while any condition is absent",()=>{
 assert.equal(publicCheckoutReadiness(good).checkout_ready,true);
 assert.equal(publicCheckoutReadiness(good).checkout_features_ready,true);
 assert.equal(publicCheckoutReadiness({...good,preview:true}).checkout_ready,false);
 for(const key of ["checkoutEnabled","legalReady","notificationsReady","shippingReady","paymentsReady"]){
  assert.equal(publicCheckoutReadiness({...good,[key]:false}).checkout_ready,false,key);
 }
 assert.equal(publicCheckoutReadiness({...good,features:all.filter(f=>f.feature_key!=="cart")}).checkout_ready,false);
 assert.equal(publicCheckoutReadiness().checkout_ready,false);
});

test("API and storefront agree on commerce eligibility at every live payment boundary",async()=>{
 const api=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const client=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 const start=api.indexOf('publicRouter.get("/store"');
 const end=api.indexOf('publicRouter.post("/newsletter/subscribe"',start);
 const store=api.slice(start,end);
 assert.ok(store.includes("publicCheckoutReadiness({preview:req.previewStore,features,checkoutEnabled,legalReady,notificationsReady,shippingReady,paymentsReady})"));
 assert.ok(store.includes("checkout_features_ready:checkoutFeaturesReady"));
 assert.ok(client.includes("coreCommerceFeaturesEnabled(store.features)&&store.commerce?.checkout_ready===true"));
 for(const [from,to] of [
  ['publicRouter.get("/payment-config"','publicRouter.get("/blog/posts"'],
  ['publicRouter.post("/checkout",','publicRouter.get("/recovery/:token"'],
  ['publicRouter.post("/checkout/:token/payment"','publicRouter.get("/checkout/:token"']
 ]){
  const first=api.indexOf(from);
  const last=api.indexOf(to,first);
  assert.ok(first>=0&&last>first,from);
  const handler=api.slice(first,last);
  assert.ok(handler.includes("publicCommerceFeaturesEnabled("),from);
 }
 assert.ok(api.includes("return coreCommerceFeaturesEnabled(rows)"));
});
