// Never put unpaid, failed or fully refunded orders in shipping work queues.
// Free orders are valid once the server has recorded payment_status='paid'.
export const SETTLED_ORDER_PAYMENTS=Object.freeze(["paid","partially_refunded"]);
export function canPrepareOrder(order){
 return Boolean(order&&SETTLED_ORDER_PAYMENTS.includes(order.payment_status)
  && order.status!=="cancelled"&&order.fulfillment_status!=="cancelled");
}
export function isOrderAwaitingFulfillment(order){
 return canPrepareOrder(order)
  && ["unfulfilled","preparing"].includes(order.fulfillment_status||"unfulfilled");
}
