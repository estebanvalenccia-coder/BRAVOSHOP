import test from "node:test";
import assert from "node:assert/strict";
import {missingCommercialEvidence,REQUIRED_COMMERCIAL_EVIDENCE} from "./commercialEvidence.js";
test("commercial launch stays blocked when provider keys exist but no connected merchant",()=>{
  assert.deepEqual(missingCommercialEvidence({}),REQUIRED_COMMERCIAL_EVIDENCE);
  assert.deepEqual(missingCommercialEvidence({connected_payouts:true}),REQUIRED_COMMERCIAL_EVIDENCE.slice(1));
});
test("successful checkout without refund or recurring billing does not qualify",()=>{
  assert.deepEqual(missingCommercialEvidence({
    connected_payouts:true,paid_order:true,processed_payment_webhook:true,
    successful_refund:false,recurring_billing:false
  }),["successful_refund","recurring_billing"]);
});
test("all five evidence signals are required",()=>{
  assert.deepEqual(missingCommercialEvidence(Object.fromEntries(REQUIRED_COMMERCIAL_EVIDENCE.map(k=>[k,true]))),[]);
});
