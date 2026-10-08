import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{assertRefundMatchesOrder,RefundReconciliationError}from"../server/services/refundReconciliation.js";

const order={
 amount:18.75,currency:"EUR",payment_intent_id:"pi_original",
 payment_provider:"stripe",provider_refund_id:null
};
const stripeRefund={
 id:"re_correct",object:"refund",amount:1875,currency:"eur",
 payment_intent:"pi_original",status:"succeeded"
};

test("accept matching Stripe refunds with original amount, currency and PaymentIntent",()=>{
 assert.equal(assertRefundMatchesOrder(stripeRefund,order,{requirePaymentIntent:true}),true);
 assert.equal(assertRefundMatchesOrder({...stripeRefund,payment_intent:{id:"pi_original"}},order,{requirePaymentIntent:true}),true);
 assert.equal(assertRefundMatchesOrder({...stripeRefund,payment_intent:null},{...order,provider_refund_id:"re_correct"}),true);
});

test("reject mismatched amount, currency, PaymentIntent or stored Stripe refund id",()=>{
 const variants=[
  [{...stripeRefund,amount:1874},order,"AMOUNT_MISMATCH"],
  [{...stripeRefund,amount:1876},order,"AMOUNT_MISMATCH"],
  [{...stripeRefund,amount:1875.5},order,"AMOUNT_MISMATCH"],
  [{...stripeRefund,amount:0},order,"AMOUNT_MISMATCH"],
  [{...stripeRefund,currency:"usd"},order,"CURRENCY_MISMATCH"],
  [{...stripeRefund,currency:null},order,"CURRENCY_MISMATCH"],
  [{...stripeRefund,payment_intent:"pi_other"},order,"PAYMENT_INTENT_MISMATCH"],
  [{...stripeRefund,payment_intent:null},order,"PAYMENT_INTENT_MISMATCH"],
  [stripeRefund,{...order,provider_refund_id:"re_another"},"REFUND_ID_MISMATCH"],
  [stripeRefund,{...order,payment_provider:"free"},"INVALID_REFERENCE"],
  [stripeRefund,{...order,payment_intent_id:null},"INVALID_REFERENCE"]
 ];
 for(const [payload,binding,reason] of variants){
  assert.throws(
   ()=>assertRefundMatchesOrder(payload,binding,{requirePaymentIntent:true}),
   error=>error instanceof RefundReconciliationError&&error.code==="STRIPE_REFUND_"+reason,
   reason
  );
 }
});

test("webhook verifies a Stripe refund before updating accounting, inventory and email",async()=>{
 const src=await readFile(new URL("../server/routes/stripeWebhook.js",import.meta.url),"utf8");
 const start=src.indexOf("async function updateRefundFromStripe(");
 const end=src.indexOf("async function updateConnectedAccount(",start);
 assert.ok(start>=0&&end>start);
 const flow=src.slice(start,end);
 for(const condition of [
  "r.provider_refund_id",
  "o.currency",
  "o.payment_provider",
  "o.provider_payment_id as payment_intent_id",
  "assertRefundMatchesOrder(refund,owners[0]",
  "requirePaymentIntent:!owners[0].provider_refund_id",
  "recordWebhookIncident(req,event,storeId,error.code",
  "bravoshop_update_refund_for_store(",
  "bravoshop_restock_refunded_order(",
  "enqueueOrderNotification("
 ])assert.ok(flow.includes(condition),condition);
 assert.ok(flow.indexOf("assertRefundMatchesOrder(")<flow.indexOf("bravoshop_update_refund_for_store("));
 assert.ok(flow.indexOf("assertRefundMatchesOrder(")<flow.indexOf("bravoshop_restock_refunded_order("));
});

test("merchant refund endpoint validates exact cents and Stripe refund before settling",async()=>{
 const src=await readFile(new URL("../server/routes/commerce.js",import.meta.url),"utf8");
 const start=src.indexOf('commerceRouter.post("/orders/:id/refunds"');
 const end=src.indexOf('commerceRouter.get("/customers"',start);
 assert.ok(start>=0&&end>start);
 const flow=src.slice(start,end);
 assert.ok(flow.includes("requiresCurrencyMinorUnitUpgrade(order.currency)"));
 assert.ok(flow.includes("!parseCatalogPrice(req.body.amount).ok"));
 assert.ok(flow.includes("!isValidTwoDecimalStripeAmount(req.body.amount)"));
 assert.ok(flow.includes("assertRefundMatchesOrder(providerRefund,"));
 assert.ok(flow.includes("requirePaymentIntent:true"));
 assert.ok(flow.indexOf("assertRefundMatchesOrder(")<flow.indexOf("bravoshop_update_refund_for_store(${refundId}::uuid,${req.storeId}::uuid,${providerRefund.id}"));
});
