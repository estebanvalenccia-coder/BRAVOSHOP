import{Router}from"express";
import Stripe from"stripe";
import{sql}from"../db/neon.js";
import{requireAuth,requireStore}from"../middleware/auth.js";
import{requirePermission}from"../middleware/permissions.js";
import{persistPlatformSubscription}from"../services/platformBilling.js";

export const billingRouter=Router({mergeParams:true});
billingRouter.use(requireAuth,requireStore);

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const appUrl=()=>String(process.env.BRAVOSHOP_APP_URL||"https://app.bravoshop.online").replace(/\/$/,"");

async function ensurePlanPrice(stripe,plan,interval){
 const amount=Number(interval==="year"?plan.annual_price:plan.monthly_price);
 if(!Number.isFinite(amount)||amount<=0)throw Object.assign(new Error("Este plan todavía no tiene precio de cobro configurado"),{statusCode:409});
 const amountCents=Math.round(amount*100);
 const currency=String(plan.currency||"EUR").toLowerCase();
 const key=interval==="year"?"provider_annual_price_id":"provider_monthly_price_id";
 let priceId=plan[key]||null;
 if(priceId){
  try{
   const price=await stripe.prices.retrieve(priceId);
   if(price.active&&price.unit_amount===amountCents&&price.currency===currency&&price.recurring?.interval===interval)return priceId;
  }catch{}
  priceId=null;
 }
 let productId=plan.provider_product_id||null;
 if(productId){
  try{const product=await stripe.products.retrieve(productId);if(product.deleted)productId=null}catch{productId=null}
 }
 if(!productId){
  const product=await stripe.products.create(
   {name:"BravoShop "+plan.name,metadata:{bravoshop_plan_id:String(plan.id),bravoshop_plan_slug:String(plan.slug)}},
   {idempotencyKey:"bravoshop-plan-product-"+plan.id}
  );
  productId=product.id;
 }
 const price=await stripe.prices.create(
  {currency,unit_amount:amountCents,recurring:{interval},product:productId,nickname:`BravoShop ${plan.name} ${interval==="year"?"anual":"mensual"}`,metadata:{bravoshop_plan_id:String(plan.id)}},
  {idempotencyKey:`bravoshop-plan-price-${plan.id}-${interval}-${currency}-${amountCents}`}
 );
 if(interval==="year")await sql`update plans set provider_product_id=${productId},provider_annual_price_id=${price.id} where id=${plan.id}::uuid`;
 else await sql`update plans set provider_product_id=${productId},provider_monthly_price_id=${price.id} where id=${plan.id}::uuid`;
 return price.id;
}

billingRouter.get("/billing",requirePermission("billing.read"),async(req,res)=>{
 const [plans,current]=await Promise.all([
  sql`select id,name,slug,monthly_price,annual_price,currency,trial_days,metadata
      from plans where status='active' and is_public=true order by coalesce((metadata->>'tier')::int,999),name`,
  sql`select ss.status,ss.trial_ends_at,ss.complimentary_until,ss.complimentary_reason,
      ss.billing_interval,ss.current_period_end,ss.cancel_at_period_end,ss.last_invoice_status,
      ss.provider_customer_id,ss.provider_subscription_id,
      p.id as plan_id,p.name as plan_name,p.slug as plan_slug
      from store_subscriptions ss left join plans p on p.id=ss.plan_id
      where ss.store_id=${req.storeId}::uuid limit 1`
 ]);
 res.json({provider_configured:Boolean(process.env.STRIPE_SECRET_KEY),current:current[0]||null,plans});
});

billingRouter.post("/billing/checkout",requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe Billing no está configurado"});
 const planRef=String(req.body?.plan_id||req.body?.plan||"").trim();
 const interval=req.body?.interval==="year"?"year":"month";
 if(!planRef)return res.status(400).json({error:"Plan no válido"});
 const plans=UUID.test(planRef)?await sql`select id,name,slug,monthly_price,annual_price,currency,provider_product_id,provider_monthly_price_id,provider_annual_price_id from plans where id=${planRef}::uuid and status='active' and is_public=true limit 1`:await sql`select id,name,slug,monthly_price,annual_price,currency,provider_product_id,provider_monthly_price_id,provider_annual_price_id from plans where slug=${planRef.toLowerCase()} and status='active' and is_public=true limit 1`;
 if(!plans.length)return res.status(404).json({error:"Plan no disponible"});
 const plan=plans[0];
 const current=(await sql`select * from store_subscriptions where store_id=${req.storeId}::uuid limit 1`)[0]||null;
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 let priceId;
 try{priceId=await ensurePlanPrice(stripe,plan,interval)}catch(error){if(error.statusCode)return res.status(error.statusCode).json({error:error.message});throw error}
 if(current?.provider_subscription_id&&["active","trialing"].includes(String(current.status))){
  const subscription=await stripe.subscriptions.retrieve(current.provider_subscription_id);
  const item=subscription.items?.data?.[0];
  if(!item)return res.status(409).json({error:"La suscripción actual no tiene una línea de plan válida"});
  const updated=await stripe.subscriptions.update(current.provider_subscription_id,{
   items:[{id:item.id,price:priceId}],
   proration_behavior:"create_prorations",
   metadata:{...(subscription.metadata||{}),bravoshop_billing:"1",bravoshop_billing_store_id:String(req.storeId),bravoshop_store_id:String(req.storeId),bravoshop_plan_id:String(plan.id)}
  });
  await persistPlatformSubscription(updated,{storeId:req.storeId,planId:plan.id});
  return res.json({updated:true,status:updated.status});
 }
 if(current?.provider_subscription_id&&["past_due","unpaid","paused"].includes(String(current.status))){
  return res.status(409).json({error:"Actualiza primero el método de pago desde Gestionar facturación.",code:"PAYMENT_ACTION_REQUIRED"});
 }
 let customerId=current?.provider_customer_id||null;
 if(!customerId){
  const users=await sql`select email,name from app_users where id=${req.user.id}::uuid limit 1`;
  const customer=await stripe.customers.create({
   email:users[0]?.email||req.user.email,
   name:users[0]?.name||undefined,
   metadata:{bravoshop_store_id:String(req.storeId)}
  },{idempotencyKey:"bravoshop-billing-customer-"+req.storeId});
  customerId=customer.id;
 }
 const metadata={
  bravoshop_billing:"1",
  bravoshop_billing_store_id:String(req.storeId),
  bravoshop_store_id:String(req.storeId),
  bravoshop_plan_id:String(plan.id)
 };
 const session=await stripe.checkout.sessions.create({
  mode:"subscription",
  customer:customerId,
  client_reference_id:String(req.storeId),
  line_items:[{quantity:1,price:priceId}],
  metadata,
  subscription_data:{metadata},
  success_url:appUrl()+"/?billing=success&store="+encodeURIComponent(req.storeId)+"&session_id={CHECKOUT_SESSION_ID}",
  cancel_url:appUrl()+"/?billing=cancelled&store="+encodeURIComponent(req.storeId)
 });
 await sql`
  insert into store_subscriptions(store_id,plan_id,status,provider_customer_id,provider_checkout_session_id,updated_at)
  values(${req.storeId}::uuid,${plan.id}::uuid,'incomplete',${customerId},${session.id},now())
  on conflict(store_id) do update set
   provider_customer_id=excluded.provider_customer_id,
   provider_checkout_session_id=excluded.provider_checkout_session_id,
   updated_at=now()`;
 res.status(201).json({url:session.url,session_id:session.id});
});

billingRouter.post("/billing/sync",requirePermission("billing.read"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe Billing no está configurado"});
 const rows=await sql`select provider_subscription_id,provider_checkout_session_id,plan_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;
 if(!rows.length)return res.json({synced:false});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 let subscriptionId=rows[0].provider_subscription_id||null;
 if(!subscriptionId&&rows[0].provider_checkout_session_id){
  try{
   const session=await stripe.checkout.sessions.retrieve(rows[0].provider_checkout_session_id);
   subscriptionId=typeof session.subscription==="string"?session.subscription:session.subscription?.id||null;
  }catch{}
 }
 if(!subscriptionId)return res.json({synced:false});
 const subscription=await stripe.subscriptions.retrieve(subscriptionId);
 await persistPlatformSubscription(subscription,{storeId:req.storeId,planId:rows[0].plan_id});
 res.json({synced:true,status:subscription.status});
});

billingRouter.post("/billing/cancel",requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe Billing no está configurado"});
 const rows=await sql`select provider_subscription_id,plan_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;
 if(!rows[0]?.provider_subscription_id)return res.status(409).json({error:"No hay una suscripción recurrente que cancelar"});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const subscription=await stripe.subscriptions.update(rows[0].provider_subscription_id,{cancel_at_period_end:true});
 await persistPlatformSubscription(subscription,{storeId:req.storeId,planId:rows[0].plan_id});
 res.json({status:subscription.status,cancel_at_period_end:true});
});

billingRouter.post("/billing/resume",requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe Billing no está configurado"});
 const rows=await sql`select provider_subscription_id,plan_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;
 if(!rows[0]?.provider_subscription_id)return res.status(409).json({error:"No hay una suscripción recurrente que reactivar"});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const subscription=await stripe.subscriptions.update(rows[0].provider_subscription_id,{cancel_at_period_end:false});
 await persistPlatformSubscription(subscription,{storeId:req.storeId,planId:rows[0].plan_id});
 res.json({status:subscription.status,cancel_at_period_end:false});
});

billingRouter.post("/billing/portal",requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe Billing no está configurado"});
 const rows=await sql`select provider_customer_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;
 if(!rows[0]?.provider_customer_id)return res.status(409).json({error:"Esta tienda todavía no tiene cliente de facturación"});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 try{
  const portal=await stripe.billingPortal.sessions.create({customer:rows[0].provider_customer_id,return_url:appUrl()+"/?billing=return&store="+encodeURIComponent(req.storeId)});
  res.json({url:portal.url});
 }catch(error){
  console.error(JSON.stringify({level:"error",error_code:"BILLING_PORTAL_FAILED",store_id:req.storeId,message:error.message}));
  res.status(502).json({error:"No se pudo abrir el portal de facturación de Stripe"});
 }
});
