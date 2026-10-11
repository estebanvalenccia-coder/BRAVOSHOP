// A Stripe PaymentIntent belongs to one immutable merchant checkout.
// Retry the exact stored intent, never create another one for the same token.
const REUSABLE_STATUSES=new Set(["requires_payment_method","requires_confirmation","requires_action"]);
const PROCESSING_STATUSES=new Set(["processing","succeeded","requires_capture"]);
export function existingCheckoutIntentDecision(intent,checkout){
 if(!intent||!checkout||intent.id!==checkout.provider_payment_id
  ||intent.metadata?.bravoshop_checkout_id!==String(checkout.id)
  ||intent.metadata?.bravoshop_store_id!==String(checkout.store_id)
  ||String(intent.currency||"").toUpperCase()!==String(checkout.currency||"").toUpperCase()
  ||intent.amount!==Math.round(Number(checkout.total)*100)){
  return {action:"reject",message:"El intento de pago no coincide con este pedido. Contacta con la tienda."};
 }
 if(REUSABLE_STATUSES.has(intent.status)&&typeof intent.client_secret==="string"&&intent.client_secret){
  return {action:"resume",status:intent.status,client_secret:intent.client_secret};
 }
 if(PROCESSING_STATUSES.has(intent.status)){
  return {action:"processing",message:"Stripe ya está procesando este pago. Usa «Comprobar estado del pago» para actualizar el pedido; no vuelvas a pagar."};
 }
 return {action:"new_checkout",message:"Este intento de pago ya no está disponible. Vuelve al carrito para generar un pedido nuevo."};
}
