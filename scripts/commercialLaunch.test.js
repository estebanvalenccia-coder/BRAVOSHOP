import test from"node:test";
import assert from"node:assert/strict";
import{evaluatePilotStore,commercialPilotSummary}from"../server/services/commercialLaunch.js";
const connected={stripe:true,email:true,checkout:true};
const candidate={id:"one",name:"Herencia",slug:"herencia",sector:"plants",status:"active",plan_valid:true,design_ready:true,
 saleable_variants:3,active_products:2,published:true,legal_ready:true,shipping_ready:true,
 checkout_features_ready:true,connect_ready:true};
test("a genuinely sale-ready shop passes the technical checklist but not payment proof",()=>{
 const store=evaluatePilotStore(candidate,connected);
 assert.equal(store.ready,true);
 assert.equal(store.completed,store.total);
 assert.equal(store.activeProducts,2);
 const totals=commercialPilotSummary([store],{paidOrders:0,storesTotal:1,connectedStripe:1});
 assert.equal(totals.readyInSample,1);
 assert.equal(totals.stripeOrdersRecorded,false);
 assert.equal(totals.requiresManualCheckoutAndRefundProof,true);
});
test("online API or public catalogue cannot replace actual payment onboarding",()=>{
 const missing=evaluatePilotStore({...candidate,connect_ready:false},connected);
 assert.equal(missing.ready,false);
 assert.ok(missing.missing.some(x=>x.key==="payments"));
 assert.equal(missing.missing.some(x=>x.key==="catalog"),false);
 const hidden=evaluatePilotStore({...candidate,published:false},connected);
 assert.equal(hidden.ready,false);
 assert.ok(hidden.missing.some(x=>x.key==="published"));
});
test("trials, invalid subscriptions, missing shipping and legal details block checkout",()=>{
 const checks=evaluatePilotStore({...candidate,status:"trial",plan_valid:false,shipping_ready:false,legal_ready:false},connected);
 assert.deepEqual(checks.missing.map(x=>x.key),["plan","legal","shipping"]);
});
test("services do not require physical shipping, but require real Stripe and notifications",()=>{
 const store=evaluatePilotStore({...candidate,sector:"services",shipping_ready:false},{stripe:true,email:false,checkout:true});
 assert.equal(store.checks.find(x=>x.key==="shipping").ok,true);
 assert.equal(store.checks.find(x=>x.key==="email").ok,false);
 assert.equal(store.ready,false);
});
test("missing checkout modules, global kill switch or platform credentials prevent a ready status",()=>{
 const store=evaluatePilotStore({...candidate,checkout_features_ready:false},{stripe:false,email:true,checkout:false});
 assert.deepEqual(store.missing.map(x=>x.key),["checkout_features","platform_payments","checkout_enabled"]);
});
test("numeric counters do not treat missing or null fields as ready",()=>{
 const store=evaluatePilotStore({name:"Invalid",slug:"invalid",status:"unpaid",saleable_variants:null},connected);
 assert.equal(store.ready,false);
 assert.equal(store.saleableVariants,0);
 assert.ok(store.missing.length>=6);
});
