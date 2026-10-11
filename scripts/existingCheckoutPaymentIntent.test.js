import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {existingCheckoutIntentDecision} from "../server/services/existingCheckoutIntent.js";

const checkout={id:"checkout-uuid",store_id:"store-uuid",provider_payment_id:"pi_original",currency:"EUR",total:12.5};
const base={id:"pi_original",status:"requires_payment_method",client_secret:"pi_secret",currency:"eur",amount:1250,
 metadata:{bravoshop_checkout_id:"checkout-uuid",bravoshop_store_id:"store-uuid"}};
test("reopening a checkout resumes the exact original merchant PaymentIntent",()=>{
 for(const status of ["requires_payment_method","requires_confirmation","requires_action"]){
  const d=existingCheckoutIntentDecision({...base,status},checkout);
  assert.deepEqual(d,{action:"resume",status,client_secret:"pi_secret"});
 }
});
test("never expose an unrelated, altered, missing-secret or wrong-amount payment",()=>{
 const invalid=[
  {...base,id:"pi_different"}, {...base,amount:1350},
  {...base,currency:"usd"}, {...base,client_secret:null},
  {...base,metadata:{...base.metadata,bravoshop_store_id:"another-store"}},
  {...base,metadata:{...base.metadata,bravoshop_checkout_id:"another-checkout"}},
 ];
 for(const pi of invalid){
  const r=existingCheckoutIntentDecision(pi,checkout);
  assert.notEqual(r.action,"resume",JSON.stringify(pi));
 }
 assert.equal(existingCheckoutIntentDecision(null,checkout).action,"reject");
});
test("already charged or processing Intent is never recreated or presented as a new payment",()=>{
 for(const status of ["processing","succeeded","requires_capture"]){
  const d=existingCheckoutIntentDecision({...base,status},checkout);
  assert.equal(d.action,"processing");
  assert.ok(d.message.includes("Comprobar estado del pago"));
 }
 for(const status of ["canceled","unexpected_status"]){
  assert.equal(existingCheckoutIntentDecision({...base,status},checkout).action,"new_checkout");
 }
});
test("payment route atomically claims and checks persisted Intent before creating a new one",async()=>{
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const a=source.indexOf('publicRouter.post("/checkout/:token/payment"');
 const b=source.indexOf('publicRouter.get("/checkout/:token"',a);
 assert.ok(a>=0&&b>a);
 const route=source.slice(a,b);
 const markers=[
  "bravoshop_reserve_checkout_inventory(",
  "bravoshop_claim_checkout_payment(",
  "select provider_payment_id from checkout_sessions",
  "stripe.paymentIntents.retrieve(existing[0].provider_payment_id",
  "existingCheckoutIntentDecision(intent,",
  'if(decision.action==="resume")return res.json',
  "stripe.paymentIntents.create(",
  "bravoshop_finish_checkout_payment_claim("
 ];
 let previous=-1;for(const x of markers){const next=route.indexOf(x);assert.ok(next>previous,x);previous=next;}
 assert.ok(route.includes("where id=${c.id}::uuid and store_id=${c.store_id}::uuid"));
 assert.ok(route.includes("and completed_order_id is null"));
 assert.ok(route.includes("stripeAccount:c.provider_account_id"));
 assert.ok(route.includes("provider_payment_id,c.shipping_rate_id"));
});
