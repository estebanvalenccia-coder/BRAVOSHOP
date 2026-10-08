import{Router}from"express";import{randomUUID}from"node:crypto";import{sql}from"../db/neon.js";import{requireAuth}from"../middleware/auth.js";import{requireSuperAdmin}from"../middleware/superAdmin.js";import{mediaReady}from"../services/mediaSigner.js";import{railwayDomainsReady}from"../services/railwayDomains.js";import{createCompatiblePromotionCode}from"../services/stripePromotionCode.js";
export const adminRouter=Router();const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;adminRouter.param("id",(req,res,next,id)=>UUID.test(String(id||""))?next():res.status(404).json({error:"Recurso no encontrado"}));adminRouter.use(requireAuth,requireSuperAdmin);
async function audit(req,action,resourceType,resourceId,details={}){const storeId=resourceType==="store"?resourceId:null;await sql`insert into audit_log(actor_user_id,actor_type,store_id,action,resource_type,resource_id,request_id,ip,user_agent,details) values(${req.user.id}::uuid,'super_admin',${storeId}::uuid,${action},${resourceType},${resourceId||null},${req.requestId||null},${req.ip||null},${req.get("user-agent")||null},${JSON.stringify(details)}::jsonb)`}
adminRouter.get("/summary",async(_req,res)=>{const[stores,users,orders,mrr]=await Promise.all([sql`select count(*)::int as n from stores where status in ('active','trial')`,sql`select count(*)::int as n from app_users where status='active'`,sql`select count(*)::int as n from orders where created_at>=date_trunc('day',now())`,sql`select coalesce(sum(p.monthly_price),0)::numeric as n from store_subscriptions s join plans p on p.id=s.plan_id where s.status='active' and s.complimentary_reason is null`]);const controls=await sql`select key,enabled,reason,updated_at from platform_controls order by key`;res.json({metrics:{stores:stores[0].n,users:users[0].n,orders_today:orders[0].n,mrr:Number(mrr[0].n)},controls})});
adminRouter.get("/users",async(_req,res)=>{const rows=await sql`select u.id,u.email,u.name,u.role,u.status,u.created_at,count(distinct sm.store_id)::int as stores from app_users u left join store_members sm on sm.user_id=u.id group by u.id order by u.created_at desc limit 250`;res.json({users:rows})});
adminRouter.get("/stores",async(req,res)=>{const q=String(req.query.q||"").trim();const rows=q?await sql`select s.*,o.name as organization_name,ss.status as subscription_status,p.name as plan_name from stores s join organizations o on o.id=s.organization_id left join store_subscriptions ss on ss.store_id=s.id left join plans p on p.id=ss.plan_id where s.name ilike ${"%"+q+"%"} or s.slug ilike ${"%"+q+"%"} order by s.created_at desc limit 200`:await sql`select s.*,o.name as organization_name,ss.status as subscription_status,p.name as plan_name from stores s join organizations o on o.id=s.organization_id left join store_subscriptions ss on ss.store_id=s.id left join plans p on p.id=ss.plan_id order by s.created_at desc limit 200`;res.json({stores:rows})});
adminRouter.patch("/stores/:id",async(req,res)=>{const allowed=new Set(["active","trial","suspended","unpaid","maintenance","scheduled_for_deletion"]);const{status}=req.body||{};if(!allowed.has(status))return res.status(400).json({error:"Estado no permitido"});const rows=await sql`update stores set status=${status},updated_at=now() where id=${req.params.id}::uuid returning *`;if(!rows.length)return res.status(404).json({error:"Tienda no encontrada"});await audit(req,"store.status.updated","store",req.params.id,{status});res.json({store:rows[0]})});
adminRouter.get("/controls",async(_req,res)=>{const rows=await sql`select * from platform_controls order by key`;res.json({controls:rows})});
adminRouter.put("/controls/:key",async(req,res)=>{const{enabled,reason}=req.body||{};const rows=await sql`insert into platform_controls(key,enabled,reason,updated_at) values(${req.params.key},${Boolean(enabled)},${reason||null},now()) on conflict(key) do update set enabled=excluded.enabled,reason=excluded.reason,updated_at=now() returning *`;await audit(req,"platform.control.updated","platform_control",req.params.key,{enabled:Boolean(enabled),reason:reason||null});res.json({control:rows[0]})});
adminRouter.get("/plans",async(_req,res)=>{const rows=await sql`select * from plans order by monthly_price nulls last,name`;res.json({plans:rows})});
adminRouter.post("/plans",async(req,res)=>{
 const p=req.body||{};const name=String(p.name||"").trim(),slug=String(p.slug||"").trim().toLowerCase(),currency=String(p.currency||"EUR").toUpperCase();
 const monthly=p.monthly_price==null||p.monthly_price===""?null:Number(p.monthly_price),annual=p.annual_price==null||p.annual_price===""?null:Number(p.annual_price),trial=Number(p.trial_days||0);
 if(!name||!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug))return res.status(400).json({error:"Nombre y slug válidos requeridos"});
 if(!/^[A-Z]{3}$/.test(currency)||monthly!==null&&(!Number.isFinite(monthly)||monthly<0)||annual!==null&&(!Number.isFinite(annual)||annual<0)||!Number.isSafeInteger(trial)||trial<0||trial>365)return res.status(400).json({error:"Precio, moneda o prueba no válidos"});
 const rows=await sql`insert into plans(id,name,slug,status,monthly_price,annual_price,currency,trial_days,is_public,metadata) values(${randomUUID()}::uuid,${name},${slug},${p.status||"active"},${monthly},${annual},${currency},${trial},${p.is_public!==false},${JSON.stringify(p.metadata||{})}::jsonb) returning *`;
 await audit(req,"plan.created","plan",rows[0].id,{name});res.status(201).json({plan:rows[0]});
});
adminRouter.patch("/plans/:id",async(req,res)=>{
 const p=req.body||{};const current=await sql`select * from plans where id=${req.params.id}::uuid limit 1`;if(!current.length)return res.status(404).json({error:"Plan no encontrado"});
 const old=current[0];const name=p.name===undefined?old.name:String(p.name).trim();const status=p.status===undefined?old.status:String(p.status);
 const monthly=p.monthly_price===undefined?old.monthly_price:(p.monthly_price==null||p.monthly_price===""?null:Number(p.monthly_price));
 const annual=p.annual_price===undefined?old.annual_price:(p.annual_price==null||p.annual_price===""?null:Number(p.annual_price));
 const currency=p.currency===undefined?old.currency:String(p.currency).toUpperCase();const trial=p.trial_days===undefined?Number(old.trial_days):Number(p.trial_days);
 if(!name||!/^[A-Z]{3}$/.test(currency)||monthly!==null&&(!Number.isFinite(Number(monthly))||Number(monthly)<0)||annual!==null&&(!Number.isFinite(Number(annual))||Number(annual)<0)||!Number.isSafeInteger(trial)||trial<0||trial>365)return res.status(400).json({error:"Datos del plan no válidos"});
 const monthlyChanged=Number(old.monthly_price)!==Number(monthly)||old.monthly_price===null&&monthly!==null||old.monthly_price!==null&&monthly===null||String(old.currency||"EUR")!==currency;
 const annualChanged=Number(old.annual_price)!==Number(annual)||old.annual_price===null&&annual!==null||old.annual_price!==null&&annual===null||String(old.currency||"EUR")!==currency;
 const publicPlan=["basic","premium"].includes(old.slug)?true:(p.is_public===undefined?Boolean(old.is_public):Boolean(p.is_public));const rows=await sql`update plans set name=${name},status=${status},monthly_price=${monthly},annual_price=${annual},currency=${currency},trial_days=${trial},is_public=${publicPlan},provider_monthly_price_id=case when ${monthlyChanged} then null else provider_monthly_price_id end,provider_annual_price_id=case when ${annualChanged} then null else provider_annual_price_id end where id=${req.params.id}::uuid returning *`;
 await audit(req,"plan.updated","plan",req.params.id,p);res.json({plan:rows[0]});
});
const PROMOTION_KINDS=new Set(["percent","fixed","free_months","complimentary"]);
function normalizePlatformPromotion(input={}){
 const code=String(input.code||"").trim().toUpperCase(),kind=String(input.kind||"").trim();
 if(!/^[A-Z0-9][A-Z0-9-]{3,63}$/.test(code)||!PROMOTION_KINDS.has(kind))throw Object.assign(new Error("Código o tipo de promoción no válido"),{statusCode:400});
 const value=Number(kind==="free_months"?(input.free_months??input.value):input.value);
 if(kind==="percent"&&(!Number.isFinite(value)||value<=0||value>100))throw Object.assign(new Error("El descuento debe estar entre 0 y 100%"),{statusCode:400});
 if(kind==="fixed"&&(!Number.isFinite(value)||value<=0||value>9999))throw Object.assign(new Error("El importe en euros no es válido"),{statusCode:400});
 if(kind==="free_months"&&(!Number.isInteger(value)||value<1||value>12))throw Object.assign(new Error("Los meses gratis deben estar entre 1 y 12"),{statusCode:400});
 const maxUses=input.max_uses==null||input.max_uses===""?null:Number(input.max_uses);
 if(maxUses!==null&&(!Number.isSafeInteger(maxUses)||maxUses<1||maxUses>1000000))throw Object.assign(new Error("Límite de usos no válido"),{statusCode:400});
 const ends=input.ends_at?Date.parse(input.ends_at):null;
 if(ends!==null&&(!Number.isFinite(ends)||ends<=Date.now()))throw Object.assign(new Error("La fecha de caducidad debe ser futura"),{statusCode:400});
 return {code,kind,value:kind==="complimentary"?100:value,free_months:kind==="free_months"?value:null,max_uses:maxUses,ends_at:ends?new Date(ends).toISOString():null};
}
async function syncPromotionToStripe(row){
 if(!process.env.STRIPE_SECRET_KEY)throw Object.assign(new Error("Stripe Billing no está configurado"),{statusCode:503});
 if(row.metadata?.stripe_promotion_code_id&&row.active===false)throw Object.assign(new Error("Un código desactivado en Stripe no puede reactivarse: crea uno nuevo"),{statusCode:409});
 const p=normalizePlatformPromotion(row),Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const opts={name:"BravoShop "+p.code,duration:p.kind==="complimentary"?"forever":p.kind==="free_months"?"repeating":"once",metadata:{bravoshop_promotion_id:String(row.id),bravoshop_code:p.code}};
 if(p.kind==="percent")opts.percent_off=p.value;
 else if(p.kind==="fixed"){opts.amount_off=Math.round(p.value*100);opts.currency="eur"}
 else opts.percent_off=100;
 if(p.kind==="free_months")opts.duration_in_months=p.free_months;
 let couponId=row.metadata?.stripe_coupon_id||null;
 if(!couponId){
  const coupon=await stripe.coupons.create(opts,{idempotencyKey:"bravoshop-coupon-"+row.id});
  couponId=coupon.id;
  await sql`update promotions set metadata=metadata||${JSON.stringify({stripe_coupon_id:couponId})}::jsonb where id=${row.id}::uuid`;
 }
 let promotionId=row.metadata?.stripe_promotion_code_id||null;
 if(!promotionId){
  const promotion=await createCompatiblePromotionCode(stripe,{code:p.code,couponId,recordId:String(row.id),maxRedemptions:p.max_uses,expiresAt:p.ends_at});
  promotionId=promotion.id;
 }
 const saved=await sql`update promotions set active=true,metadata=metadata||${JSON.stringify({stripe_coupon_id:couponId,stripe_promotion_code_id:promotionId})}::jsonb where id=${row.id}::uuid returning *`;
 return saved[0];
}
adminRouter.get("/promotions",async(_req,res)=>{const rows=await sql`select * from promotions order by starts_at desc nulls last,code`;res.json({promotions:rows})});
adminRouter.post("/promotions",async(req,res)=>{
 let p;try{p=normalizePlatformPromotion(req.body)}catch(e){return res.status(e.statusCode||400).json({error:e.message})}
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Configura Stripe Billing antes de crear promociones"});
 const already=await sql`select 1 from promotions where upper(code)=${p.code} limit 1`;
 if(already.length)return res.status(409).json({error:"Ese código ya existe"});
 const rows=await sql`insert into promotions(id,code,kind,value,free_months,ends_at,max_uses,active,metadata) values(${randomUUID()}::uuid,${p.code},${p.kind},${p.value},${p.free_months},${p.ends_at}::timestamptz,${p.max_uses},false,'{}'::jsonb) returning *`;
 const record=rows[0];
 try{
  const promotion=await syncPromotionToStripe(record);
  await audit(req,"promotion.created","promotion",record.id,{code:record.code,stripe_promotion_code_id:promotion.metadata.stripe_promotion_code_id});
  res.status(201).json({promotion});
 }catch(e){res.status(502).json({error:"Promoción guardada como pendiente: Stripe no la ha activado. "+e.message,code:record.code,promotion_id:record.id})}
});
adminRouter.post("/promotions/:id/sync",async(req,res)=>{
 const rows=await sql`select * from promotions where id=${req.params.id}::uuid limit 1`;
 if(!rows.length)return res.status(404).json({error:"Promoción no encontrada"});
 try{const promotion=await syncPromotionToStripe(rows[0]);await audit(req,"promotion.synced","promotion",rows[0].id,{code:promotion.code});res.json({promotion})}
 catch(e){res.status(e.statusCode||502).json({error:"No se pudo activar el código en Stripe: "+e.message})}
});
adminRouter.post("/promotions/:id/deactivate",async(req,res)=>{
 const rows=await sql`select * from promotions where id=${req.params.id}::uuid limit 1`;
 if(!rows.length)return res.status(404).json({error:"Promoción no encontrada"});
 const p=rows[0];
 if(!p.active)return res.json({promotion:p});
 const promotionId=p.metadata?.stripe_promotion_code_id;
 if(promotionId){
  if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe no configurado"});
  const Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  try{await stripe.promotionCodes.update(promotionId,{active:false})}catch(e){return res.status(502).json({error:"No se ha desactivado en Stripe: "+e.message})}
 }
 const updated=await sql`update promotions set active=false where id=${p.id}::uuid returning *`;
 await audit(req,"promotion.deactivated","promotion",p.id,{code:p.code,stripe_promotion_code_id:promotionId||null});
 res.json({promotion:updated[0]});
});
adminRouter.get("/feature-flags",async(_req,res)=>{const rows=await sql`select * from platform_feature_flags order by key`;res.json({flags:rows})});
adminRouter.put("/feature-flags/:key",async(req,res)=>{const{enabled,rollout_percent=0,config={}}=req.body||{};const rows=await sql`insert into platform_feature_flags(key,enabled,rollout_percent,config,updated_at) values(${req.params.key},${Boolean(enabled)},${Math.max(0,Math.min(100,Number(rollout_percent)))},${JSON.stringify(config)}::jsonb,now()) on conflict(key) do update set enabled=excluded.enabled,rollout_percent=excluded.rollout_percent,config=excluded.config,updated_at=now() returning *`;await audit(req,"feature_flag.updated","feature_flag",req.params.key,rows[0]);res.json({flag:rows[0]})});
adminRouter.get("/health",async(_req,res)=>{
 const started=Date.now();
 const integrations={
  stripe:{
   configured:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
   secret_key:Boolean(process.env.STRIPE_SECRET_KEY),
   publishable_key:Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
   webhook_secret:Boolean(process.env.STRIPE_WEBHOOK_SECRET),
   connect_webhook_secret:Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
  },
  email:{configured:Boolean(process.env.RESEND_API_KEY&&process.env.BRAVOSHOP_EMAIL_FROM)},
  media:{configured:mediaReady()},
  custom_domains:{configured:railwayDomainsReady()}
 };
 try{
  const db=await sql`select now() as now`;
  const tables=await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`;
  const incidents=await sql`select id,source,event_type,service_name,deployment_id,environment_name,status,summary,received_at from platform_incidents order by received_at desc limit 25`;
  const accounts=await sql`select count(*)::int as total,count(*) filter(where status='active' and charges_enabled=true and payouts_enabled=true)::int as active,count(*) filter(where status='onboarding')::int as onboarding,count(*) filter(where status='restricted')::int as restricted from store_payment_accounts where provider='stripe' and provider_account_id is not null`;
  res.json({ok:true,api:"online",database:"online",database_time:db[0].now,table_count:tables[0].n,latency_ms:Date.now()-started,integrations,incidents,connect_accounts:accounts[0]});
 }catch(e){
  res.status(503).json({ok:false,api:"online",database:"unavailable",latency_ms:Date.now()-started,integrations});
 }
});
adminRouter.get("/templates",async(_req,res)=>{const rows=await sql`select coalesce(theme->>'template','default') as template,count(*)::int as stores from store_theme group by coalesce(theme->>'template','default') order by stores desc,template`;res.json({templates:rows})});
adminRouter.get("/modules",async(_req,res)=>{const rows=await sql`select feature_key,count(*) filter(where enabled=true)::int as enabled_stores,count(*)::int as configured_stores from store_features group by feature_key order by feature_key`;res.json({modules:rows})});
adminRouter.get("/domains",async(_req,res)=>{const rows=await sql`select d.id,d.hostname,d.kind,d.status,d.verified_at,s.id as store_id,s.name as store_name,s.slug from domains d join stores s on s.id=d.store_id order by d.hostname limit 300`;res.json({domains:rows})});
adminRouter.get("/settings",async(_req,res)=>{const plans=await sql`select count(*)::int as n from plans where status='active' and is_public=true`;const stores=await sql`select count(*)::int as n from stores`;res.json({settings:{commercial_model:"paid_only",public_plans:plans[0].n,stores:stores[0].n,ai_policy:"premium_or_owner_grant"}})});
adminRouter.get("/audit",async(_req,res)=>{const rows=await sql`select a.*,u.email as actor_email from audit_log a left join app_users u on u.id=a.actor_user_id order by a.created_at desc limit 200`;res.json({audit:rows})});

adminRouter.get("/payment-accounts",async(req,res)=>{const q=String(req.query.q||"").trim();const rows=q?await sql`select s.id as store_id,s.name as store_name,s.slug,pa.provider,pa.provider_account_id,pa.status,pa.charges_enabled,pa.payouts_enabled,pa.details_submitted,pa.default_currency,pa.country,pa.updated_at from stores s left join store_payment_accounts pa on pa.store_id=s.id where s.name ilike ${"%"+q+"%"} or s.slug ilike ${"%"+q+"%"} order by pa.updated_at desc nulls last limit 200`:await sql`select s.id as store_id,s.name as store_name,s.slug,pa.provider,pa.provider_account_id,pa.status,pa.charges_enabled,pa.payouts_enabled,pa.details_submitted,pa.default_currency,pa.country,pa.updated_at from stores s left join store_payment_accounts pa on pa.store_id=s.id order by pa.updated_at desc nulls last limit 200`;res.json({payment_accounts:rows})});
adminRouter.get("/refunds",async(_req,res)=>{const rows=await sql`select r.id,r.order_id,r.amount,r.currency,r.status,r.reason,r.provider,r.provider_refund_id,r.created_at,r.processed_at,o.store_id,s.name as store_name,s.slug,o.order_number from order_refunds r join orders o on o.id=r.order_id join stores s on s.id=o.store_id order by r.created_at desc limit 200`;res.json({refunds:rows})});

adminRouter.put("/stores/:id/plan",async(req,res)=>{const slug=String(req.body?.plan||"").trim().toLowerCase();const plans=await sql`select id,name,slug from plans where slug=${slug} and status='active' limit 1`;if(!plans.length)return res.status(404).json({error:"Plan no encontrado"});const plan=plans[0];await sql`insert into store_subscriptions(store_id,plan_id,status,complimentary_until,complimentary_reason,provider_subscription_id,provider_price_id,provider_checkout_session_id,billing_interval,updated_at) values(${req.params.id}::uuid,${plan.id}::uuid,'active',null,'Asignación Super Admin',null,null,null,null,now()) on conflict(store_id) do update set plan_id=excluded.plan_id,status='active',complimentary_until=null,complimentary_reason='Asignación Super Admin',provider_subscription_id=null,provider_price_id=null,provider_checkout_session_id=null,billing_interval=null,updated_at=now()`;await sql`select bravoshop_refresh_store_billing(${req.params.id}::uuid)`;await audit(req,"store.plan.updated","store",req.params.id,{plan:plan.slug,complimentary:true});res.json({ok:true,plan,complimentary:true})});
adminRouter.get("/access-codes",async(_req,res)=>{const rows=await sql`select a.*,p.slug as plan_slug,p.name as plan_name from access_codes a left join plans p on p.id=a.plan_id order by (a.metadata->>'master'='true') desc,a.created_at desc limit 200`;res.json({access_codes:rows})});

adminRouter.post("/access-codes",async(req,res)=>{const p=req.body||{};const code=String(p.code||"").trim().toUpperCase();const allowedFeatures=new Set(["ai_assistant","ai_images","image_analysis"]);const grantType=p.grant_type||"feature";if(!code||!/^[A-Z0-9][A-Z0-9_-]{3,63}$/.test(code))return res.status(400).json({error:"Código no válido"});let planId=null;if(grantType==="feature"){if(!allowedFeatures.has(p.feature_key))return res.status(400).json({error:"Selecciona una función IA válida"})}else if(grantType==="plan"){const planSlug=String(p.plan||"").toLowerCase();if(!["basic","premium"].includes(planSlug))return res.status(400).json({error:"Selecciona Basic o Premium"});const planRows=await sql`select id from plans where slug=${planSlug} and status='active' limit 1`;if(!planRows.length)return res.status(404).json({error:"Plan no disponible"});planId=planRows[0].id}else return res.status(400).json({error:"Tipo de acceso no válido"});const id=randomUUID();const rows=await sql`insert into access_codes(id,code,name,grant_type,feature_key,plan_id,permanent,max_uses,active,complimentary_reason,complimentary_days) values(${id}::uuid,${code},${p.name||null},${grantType},${grantType==="feature"?p.feature_key:null},${planId}::uuid,${Boolean(p.permanent)},${p.max_uses??null},true,${p.complimentary_reason||"Concesión Super Admin"},${p.complimentary_days??null}) returning *`;await audit(req,"access_code.created","access_code",id,{code});res.status(201).json({access_code:rows[0]})});

adminRouter.patch("/access-codes/:id",async(req,res)=>{const enabled=Boolean(req.body?.active);const rows=await sql`update access_codes set active=${enabled} where id=${req.params.id}::uuid returning *`;if(!rows.length)return res.status(404).json({error:"Código no encontrado"});await audit(req,"access_code.updated","access_code",req.params.id,{active:enabled});res.json({access_code:rows[0]})});
