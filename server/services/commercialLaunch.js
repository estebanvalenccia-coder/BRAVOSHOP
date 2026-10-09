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
  paymentsVerified:paidOrders>0,commercialLaunchValidated:ready>0&&paidOrders>0};
}
