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

billingRouter.get("/billing",requirePermission("billing.read"),async(req,res)=>{
 const [plans,current]=await Promise.all([
  sql`select id,name,slug,monthly_price,annual_price,trial_days,metadata
      from plans where status='active' and is_public=true order by coalesce((metadata->>'tier')::int,999),name`,
  sql`select ss.status,ss.trial_ends_at,ss.complimentary_until,ss.complimentary_reason,
      ss.billing_interval,ss.current_period_end,ss.cancel_at_period_end,
      ss.provider_customer_id is not null as has_customer,
      ss.provider_subscription_id is not null as has_subscription,
      p.id as plan_id,p.name as plan_name,p.slug as plan_slug
      from store_subscriptions ss left join plans p on p.id=ss.plan_id
      where ss.store_id=${req.storeId}::uuid limit 1`
 ]);
 res.json({billing:{subscription:current[0]||null,plans}});
});

billingRouter.post("/billing/checkout",requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe Billing no está configurado"});
 const planId=String(req.body?.plan_id||"");
 const interval=req.body?.interval==="year"?"year":"month";
 if(!UUID.test(planId))return res.status(400).json({error:"Plan no válido"});
 const plans=await sql`select id,name,slug,monthly_price,annual_price from plans where id=${planId}::uuid and status='active' and is_public=true limit 1`;
 if(!plans.length)return res.status(404).json({error:"Plan no disponible"});
 const plan=plans[0];
 const amount=Number(interval==="year"?plan.annual_price:plan.monthly_price);
 if(!Number.isFinite(amount)||amount<=0)return res.status(409).json({error:"Este plan todavía no tiene precio de cobro configurado"});
 const current=(await sql`select * from store_subscriptions where store_id=${req.storeId}::uuid limit 1`)[0]||null;
 if(current?.provider_subscription_id&&["active","trialing","past_due","unpaid","paused"].includes(String(current.status))){
  return res.status(409).json({error:"Esta tienda ya tiene una suscripción de Stripe. Usa Gestionar facturación para cambiarla o actualizar el pago.",code:"SUBSCRIPTION_EXISTS"});
 }
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
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
 const metadata={bravoshop_billing:"1",bravoshop_store_id:String(req.storeId),bravoshop_plan_id:String(plan.id)};
 const session=await stripe.checkout.sessions.create({
  mode:"subscription",
  customer:customerId,
  client_reference_id:String(req.storeId),
  line_items:[{quantity:1,price_data:{
   currency:"eur",
   unit_amount:Math.round(amount*100),
   recurring:{interval},
   product_data:{name:"BravoShop "+plan.name,metadata:{bravoshop_plan_id:String(plan.id)}}
  }}],
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
 const rows=await sql`select provider_subscription_id,plan_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;
 if(!rows[0]?.provider_subscription_id)return res.json({synced:false});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const subscription=await stripe.subscriptions.retrieve(rows[0].provider_subscription_id);
 await persistPlatformSubscription(subscription,{storeId:req.storeId,planId:rows[0].plan_id});
 res.json({synced:true,status:subscription.status});
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
