import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {missingCommercialEvidence,REQUIRED_COMMERCIAL_EVIDENCE} from "./commercialEvidence.js";
test("server correlates pilot webhook and refund to the same paid order and Connect account",()=>{
  // Source guard only; an isolated Neon integration test is still required.
  const source=readFileSync(new URL("../server/index.js",import.meta.url),"utf8");
  assert.match(source,/e\.payment_intent_id=o\.provider_payment_id/);
  assert.match(source,/e\.store_id=o\.store_id/);
  assert.match(source,/e\.account_id=a\.provider_account_id/);
  assert.match(source,/r\.order_id=o\.id/);
  assert.match(source,/ss\.store_id=o\.store_id/);
});
test("commercial launch stays blocked when provider keys exist but no connected merchant",()=>{
  assert.deepEqual(missingCommercialEvidence({}),REQUIRED_COMMERCIAL_EVIDENCE);
  assert.deepEqual(missingCommercialEvidence({connected_payouts:true}),REQUIRED_COMMERCIAL_EVIDENCE.slice(1));
});
test("successful checkout without refund or recurring billing does not qualify",()=>{
  assert.deepEqual(missingCommercialEvidence({
    connected_payouts:true,paid_order:true,processed_payment_webhook:true,
    successful_refund:false,recurring_billing:false
  }),["successful_refund","recurring_billing","coherent_pilot"]);
});
test("unrelated paid orders, webhooks and refunds cannot authorize launch",()=>{
  const aggregateSignals={
    connected_payouts:true,paid_order:true,processed_payment_webhook:true,
    successful_refund:true,recurring_billing:true
  };
  assert.deepEqual(missingCommercialEvidence(aggregateSignals),["coherent_pilot"]);
});
test("all six evidence signals are required",()=>{
  assert.deepEqual(missingCommercialEvidence(Object.fromEntries(REQUIRED_COMMERCIAL_EVIDENCE.map(k=>[k,true]))),[]);
});
