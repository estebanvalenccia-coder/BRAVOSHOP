// Stripe Refund events must be matched against the *actual* paid order.
// A signed event + connected account are necessary, but not sufficient: a
// different refund from the same merchant must never settle a BravoShop order.
const nonEmptyId=value=>{
  if(typeof value==="string")return value.trim();
  if(value&&typeof value==="object"&&typeof value.id==="string")return value.id.trim();
  return "";
};

export class RefundReconciliationError extends Error {
 constructor(reason){
  super("El reembolso de Stripe no coincide con el pedido original");
  this.name="RefundReconciliationError";
  this.code="STRIPE_REFUND_"+reason;
 }
}

export function assertRefundMatchesOrder(refund,order,{requirePaymentIntent=false}={}){
 if(!refund||typeof refund!=="object"||!order||typeof order!=="object")
  throw new RefundReconciliationError("INVALID_PAYLOAD");

 const refundId=nonEmptyId(refund.id);
 if(!refundId.startsWith("re_")||!order.payment_intent_id||order.payment_provider!=="stripe")
  throw new RefundReconciliationError("INVALID_REFERENCE");
 const existingId=nonEmptyId(order.provider_refund_id);
 if(existingId&&existingId!==refundId)
  throw new RefundReconciliationError("REFUND_ID_MISMATCH");

 const actualAmount=refund.amount;
 const expectedAmount=Number(order.amount);
 const expectedMinor=Math.round(expectedAmount*100);
 if(!Number.isSafeInteger(actualAmount)||actualAmount<=0||
    !Number.isFinite(expectedAmount)||expectedAmount<=0||
    !Number.isSafeInteger(expectedMinor)||actualAmount!==expectedMinor)
  throw new RefundReconciliationError("AMOUNT_MISMATCH");

 const expectedCurrency=String(order.currency||"").toLowerCase();
 const actualCurrency=typeof refund.currency==="string"?refund.currency.toLowerCase():"";
 if(!/^[a-z]{3}$/.test(expectedCurrency)||actualCurrency!==expectedCurrency)
  throw new RefundReconciliationError("CURRENCY_MISMATCH");

 const intentId=nonEmptyId(refund.payment_intent);
 if((requirePaymentIntent&&!intentId)||
    (intentId&&intentId!==order.payment_intent_id))
  throw new RefundReconciliationError("PAYMENT_INTENT_MISMATCH");

 return true;
}
