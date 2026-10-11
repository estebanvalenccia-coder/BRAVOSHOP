// A read-only commercial gate for BravoShop's controlled pilot launch.
// A green Railway deploy is deliberately NOT proof that checkout can take a payment.
const REQUIREMENTS=[
 ["plan","Plan activo","Activa un plan o periodo de prueba vigente.","billing"],
 ["design","Diseño configurado","Elige y guarda una plantilla.","design"],
 ["catalog","Producto vendible","Publica un producto con variante, precio y existencias disponibles.","products"],
 ["published","Escaparate publicado","Publica la tienda desde Inicio cuando esté preparada.","home"],
 ["legal","Datos legales","Completa nombre fiscal, NIF, dirección y correo legal.","legal"],
 ["shipping","Envíos configurados","Configura una zona con tarifa activa (excepto servicios).","shipping"],
 ["checkout_features","Tienda con carrito y checkout","Activa los módulos necesarios de catálogo, carrito y checkout.","settings"],
 ["payments","Stripe Connect operativo","Completa el alta de Stripe Connect y habilita cobros y transferencias.","payments"],
 ["platform_payments","Stripe de la plataforma","Configura las credenciales y ambos webhooks de Stripe.","platform"],
 ["email","Correo transaccional","Configura Resend y el remitente de confirmaciones.","platform"],
 ["checkout_enabled","Checkout global habilitado","Revisa que el interruptor de emergencia de checkout esté activo.","platform"]
];
export function evaluatePilotStore(row,platform={}){
 const r=row||{};
 const bool=x=>x===true;
 const flags={
  plan:["active","trial"].includes(r.status)&&bool(r.plan_valid),
  design:bool(r.design_ready),
  catalog:Number(r.saleable_variants||0)>0,
  published:bool(r.published),
  legal:bool(r.legal_ready),
  shipping:r.sector==="services"||bool(r.shipping_ready),
  checkout_features:bool(r.checkout_features_ready),
  payments:bool(r.connect_ready),
  platform_payments:bool(platform.stripe),
  email:bool(platform.email),
  checkout_enabled:bool(platform.checkout)
 };
 const checks=REQUIREMENTS.map(([key,label,instruction,area])=>({key,label,instruction,area,ok:flags[key]}));
 const missing=checks.filter(x=>!x.ok);
 return {
  id:r.id,name:r.name,slug:r.slug,sector:r.sector||"general",
  published:flags.published,ready:missing.length===0,
  completed:checks.length-missing.length,total:checks.length,
  activeProducts:Number(r.active_products||0),saleableVariants:Number(r.saleable_variants||0),
  missing,checks
 };
}
export function commercialPilotSummary(stores,{paidOrders=0,storesTotal=0,activeProducts=0,connectedStripe=0}={}){
 const ready=stores.filter(x=>x.ready).length;
 return {storesTotal,activeProducts,connectedStripe,paidOrders,readyInSample:ready,checkedStores:stores.length,
  stripeOrdersRecorded:paidOrders>0,requiresManualCheckoutAndRefundProof:true};
}

/**
 * Evidence is read directly from the actual connected Stripe payment, its
 * processed webhook, the sent order confirmation and the successful refund.
 * It is deliberately not a manual toggle and never means that the public
 * storefront or tenant isolation was externally verified.
 */
export function evaluatePilotEvidence(row){
 const r=row||{};
 const orderId=r.pilot_paid_order_id||null;
 const checks=[
  {key:"paid_order",label:"Pedido con cobro Stripe registrado",ok:Boolean(orderId),
   instruction:"Autoriza una compra controlada y comprueba el cargo en la cuenta Stripe del comercio."},
  {key:"webhook",label:"Webhook de pago procesado",ok:Boolean(orderId&&r.pilot_webhook_processed===true),
   instruction:"Comprueba el webhook firmado y el PaymentIntent de esa misma compra."},
  {key:"email",label:"Confirmación de pedido enviada",ok:Boolean(orderId&&r.pilot_email_sent===true),
   instruction:"Verifica el correo de confirmación del mismo pedido; revisa la entrega con el destinatario."},
  {key:"refund",label:"Reembolso Stripe finalizado",ok:Boolean(orderId&&r.pilot_refund_success===true),
   instruction:"Solicita un reembolso autorizado y verifica el estado final en Stripe."}
 ];
 return {order_id:orderId,checks,verified:checks.every(item=>item.ok),
  requires_manual_browser_test:true,requires_manual_tenant_isolation_test:true,
  manual_checks:[
   "Compra desde otro navegador y comprueba HTTPS, stock, recibo e importes.",
   "Verifica con una segunda cuenta que no pueda acceder a pedidos, clientes ni inventario de la primera tienda.",
   "Confirma en Stripe el dinero cobrado y reembolsado, y en el buzón la entrega del email."
  ]};
}
