import{connectedAccountStatus,onboardingReturnUrl,stripeConnectSetupError}from"../services/stripeConnect.js";
import{Router}from"express";import{randomUUID}from"node:crypto";import{sql}from"../db/neon.js";import{requireAuth,requireStore}from"../middleware/auth.js";import{codeRedemptionLimiter,storeCreationLimiter}from"../middleware/rateLimit.js";import{requirePermission}from"../middleware/permissions.js";import{persistPlatformSubscription}from"../services/platformBilling.js";
import{validateImportedProducts}from"../services/catalogImport.js";
export const storesRouter=Router();storesRouter.use(requireAuth);
const SLUG=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CREATION_KEY=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AI_FEATURE_KEYS=new Set(["ai_assistant","ai_images","image_analysis"]);const FEATURE_KEYS=new Set(["catalog","cart","checkout","orders","inventory","customers","coupons","wishlist","gift_cards","reservations","subscriptions","pos","blog","marketing","automations","b2b"]);const MERCHANT_FEATURE_KEYS=new Set(["catalog","cart","checkout","orders","inventory","customers","coupons","wishlist"]);
const platformBillingConfigured=()=>Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET);
const RESERVED=new Set(["www","api","admin","app","support","status","mail","cdn","assets","static","dashboard","billing","auth","login","register","help","ftp","pop","smtp","autoconfig","store","stores","shop","checkout","webhook","webhooks","docs","developer","developers","dev","staging","test","internal","root","security","contact","notifications","imap","pop3","ns1","ns2","mx","email","media","images","files","uploads","download","downloads","public","private","system","platform"]);

async function canUsePremiumTemplate(storeId){
 const rows=await sql`
  select 1
  from store_subscriptions ss
  join plans p on p.id=ss.plan_id
  join plan_features pf on pf.plan_id=p.id and pf.feature_key='premium_templates' and pf.enabled=true
  where ss.store_id=${storeId}::uuid
    and (ss.status='active' or (ss.status='trialing' and (ss.trial_ends_at is null or ss.trial_ends_at>now())))
    and (ss.complimentary_reason is null or ss.complimentary_until is null or ss.complimentary_until>now())
  limit 1`;
 return rows.length>0;
}
storesRouter.get("/",async(req,res)=>{await sql`select bravoshop_expire_billing_access(200)`;const rows=await sql`select s.*,sm.role,coalesce(ss.settings,'{}'::jsonb) as settings,coalesce(st.theme,'{}'::jsonb) as theme,(select count(*)::int from products p where p.store_id=s.id and p.status='active') as published_products from stores s join store_members sm on sm.store_id=s.id left join store_settings ss on ss.store_id=s.id left join store_theme st on st.store_id=s.id where sm.user_id=${req.user.id}::uuid and sm.status='active' and s.status<>'scheduled_for_deletion' order by s.created_at desc`;res.json({stores:rows})});
storesRouter.post("/",storeCreationLimiter,async(req,res)=>{
 const{name,slug,sector,theme={},settings={},features=[]}=req.body||{};
 const keyHeader=req.get("Idempotency-Key")||"";
 if(keyHeader&&!CREATION_KEY.test(keyHeader))return res.status(400).json({error:"Idempotency-Key debe ser un UUID v4 válido"});
 const creationKey=keyHeader||null;
 const findPrevious=async()=>{
  if(!creationKey)return null;
  const previous=await sql`select s.id,s.name,s.slug,s.sector,s.status,sm.role,coalesce(ss.settings,'{}'::jsonb) as settings,coalesce(st.theme,'{}'::jsonb) as theme
  from store_creation_requests cr join stores s on s.id=cr.store_id
  join store_members sm on sm.store_id=s.id and sm.user_id=cr.user_id and sm.status='active'
  left join store_settings ss on ss.store_id=s.id
  left join store_theme st on st.store_id=s.id
  where cr.user_id=${req.user.id}::uuid and cr.request_key=${creationKey}::uuid limit 1`;
  return previous[0]||null;
 };
 const existing=await findPrevious();
 if(existing)return res.status(200).json({store:existing,idempotent:true});
 const baseSlug=String(slug||"").trim().toLowerCase();
 if(!name||!SLUG.test(baseSlug)||RESERVED.has(baseSlug))return res.status(400).json({error:"Nombre y subdominio válido requeridos"});
 const cleanFeatures=[...new Set(Array.isArray(features)?features:[])].filter(x=>MERCHANT_FEATURE_KEYS.has(x));
 const country=/^[A-Z]{2}$/.test(String(settings?.country||"").toUpperCase())?String(settings.country).toUpperCase():null;
 const currency=/^[A-Z]{3}$/.test(String(settings?.currency||"").toUpperCase())?String(settings.currency).toUpperCase():"EUR";
 // Premium themes may be drafted before payment; publication verifies entitlement.
 const initialSettings={...(settings||{}),published:false,preview_token:randomUUID()};
 const basePlans=await sql`select id,trial_days from plans where slug='basic' and status='active' limit 1`;
 if(!basePlans.length)return res.status(503).json({error:"El plan Basic de BravoShop no está configurado"});
 const basePlan=basePlans[0],trialDays=Math.max(0,Number(basePlan.trial_days||0));
 const startsTrial=trialDays>0,initialStoreStatus=startsTrial?"trial":"unpaid",initialSubscriptionStatus=startsTrial?"trialing":"incomplete";
 for(let attempt=0;attempt<25;attempt++){
  const suffix=attempt===0?"":"-"+(attempt+1);
  const maxBase=63-suffix.length;
  const candidate=baseSlug.slice(0,maxBase).replace(/-+$/,"")+suffix;
  if(RESERVED.has(candidate))continue;
  const orgId=randomUUID(),storeId=randomUUID();
  const queries=[
   sql`insert into organizations(id,name) values(${orgId}::uuid,${String(name).trim()})`,
   sql`insert into stores(id,organization_id,name,slug,sector,status) values(${storeId}::uuid,${orgId}::uuid,${String(name).trim()},${candidate},${sector||null},${initialStoreStatus})`,
   sql`insert into store_members(store_id,user_id,role) values(${storeId}::uuid,${req.user.id}::uuid,'owner')`,
   sql`insert into store_settings(store_id,settings) values(${storeId}::uuid,${JSON.stringify(initialSettings)}::jsonb)`,
   sql`insert into store_theme(store_id,theme) values(${storeId}::uuid,${JSON.stringify(theme)}::jsonb)`,
   sql`insert into store_payment_accounts(store_id,provider,status,country,default_currency) values(${storeId}::uuid,'stripe','not_connected',${country},${currency})`,
   sql`insert into store_subscriptions(store_id,plan_id,status,trial_ends_at,updated_at)
       values(${storeId}::uuid,${basePlan.id}::uuid,${initialSubscriptionStatus},case when ${startsTrial} then now()+make_interval(days=>${trialDays}) else null end,now())`,
   ...cleanFeatures.map(feature=>sql`insert into store_features(store_id,feature_key,enabled) values(${storeId}::uuid,${feature},true)`),
   ...(creationKey?[sql`insert into store_creation_requests(user_id,request_key,store_id) values(${req.user.id}::uuid,${creationKey}::uuid,${storeId}::uuid)`]:[])
  ];
  try{
   await sql.transaction(queries);
   return res.status(201).json({store:{id:storeId,name:String(name).trim(),slug:candidate,sector:sector||null,status:initialStoreStatus,role:"owner",settings:initialSettings,theme:theme||{},features:cleanFeatures.map(feature=>({feature_key:feature,enabled:true}))}});
  }catch(e){
   if(creationKey){const previouslyCreated=await findPrevious();if(previouslyCreated)return res.status(200).json({store:previouslyCreated,idempotent:true})}
   if(String(e).toLowerCase().includes("unique")&&attempt<24)continue;
   throw e;
  }
 }
 return res.status(409).json({error:"No se pudo reservar un subdominio disponible"});
});

// Retire a store from the merchant's account without cascading away legally
// relevant orders, invoices, payments, refunds or customer history.
storesRouter.delete("/:storeId",requireStore,async(req,res)=>{
 if(req.membership?.role!=="owner")return res.status(403).json({error:"Solo el propietario puede eliminar esta tienda"});
 const confirmSlug=req.body?.confirm_slug;
 if(typeof confirmSlug!=="string"||confirmSlug!==req.store.slug)
  return res.status(400).json({error:"Escribe exactamente el subdominio de la tienda para confirmar"});
 const rows=await sql`select bravoshop_retire_store(${req.storeId}::uuid,${req.user.id}::uuid,${confirmSlug}) as result`;
 const result=rows[0]?.result||{};
 if(!result.ok){
  const messages={
   not_found:"Tienda no encontrada",
   owner_required:"Solo el propietario puede eliminar la tienda",
   confirmation_mismatch:"La confirmación no coincide con el subdominio",
   billing_active:"Cancela la suscripción de Stripe y espera a que termine el periodo contratado",
   refunds_pending:"Hay reembolsos pendientes; resuélvelos antes de eliminar la tienda",
   orders_pending:"Hay pedidos sin entregar o importes de reembolso reservados",
   payments_pending:"Hay pagos Stripe en curso; resuélvelos antes de eliminar la tienda"
  };
  return res.status(result.reason==="not_found"?404:result.reason==="owner_required"?403:409)
   .json({code:result.reason||"STORE_RETIREMENT_BLOCKED",error:messages[result.reason]||"No se puede eliminar la tienda todavía"});
 }
 res.json({ok:true,retired:true,note:"La tienda ya no es pública ni aparece en tu panel. La información comercial y fiscal se conserva para su revisión legal."});
});

// Import only catalogue data from an authorized merchant CSV export.
// Does not transfer order/payment credentials, historic buyers or live status.
storesRouter.post("/:storeId/import/products",requireStore,requirePermission("products.create"),async(req,res)=>{
 const checked=validateImportedProducts(req.body);
 if(!checked.ok)return res.status(400).json({error:checked.error});
 const slugs=checked.products.map(p=>p.slug);
 const skus=checked.products.flatMap(p=>p.variants.map(v=>v.sku?.toLowerCase()).filter(Boolean));
 const duplicates=await sql`select slug from products where store_id=${req.storeId}::uuid and slug=any(${slugs}) limit 1`;
 if(duplicates.length)return res.status(409).json({error:"Ya existe un producto con el slug "+duplicates[0].slug+". Revisa los duplicados antes de importar."});
 if(skus.length){
  const duplicateSku=await sql`select sku from product_variants where store_id=${req.storeId}::uuid and lower(sku)=any(${skus}) limit 1`;
  if(duplicateSku.length)return res.status(409).json({error:"Ya existe la referencia SKU "+duplicateSku[0].sku+". No se sobrescribe inventario existente."});
 }
 const queries=[];
 for(const product of checked.products){
  const pid=randomUUID();
  const productPrice=product.variants[0].price;
  queries.push(sql`insert into products(id,store_id,name,slug,description,price,status,product_type,vendor,metadata,seo)
   values(${pid}::uuid,${req.storeId}::uuid,${product.name},${product.slug},
   ${product.description},${productPrice},'draft',null,${product.vendor||null},
   ${JSON.stringify({import_source:checked.source})}::jsonb,'{}'::jsonb)`);
  for(const variant of product.variants){
   const vid=randomUUID();
   queries.push(sql`insert into product_variants(id,store_id,product_id,title,sku,price,active,options)
    values(${vid}::uuid,${req.storeId}::uuid,${pid}::uuid,${variant.title},${variant.sku},
    ${variant.price},true,'{}'::jsonb)`);
   queries.push(sql`insert into inventory_levels(variant_id,quantity,reserved,track_inventory,allow_backorder)
    values(${vid}::uuid,${variant.quantity},0,${variant.track_inventory},false)`);
   if(variant.track_inventory&&variant.quantity>0)
    queries.push(sql`insert into inventory_movements(store_id,variant_id,type,quantity_delta,reserved_delta,reference_type,reference_id,actor_user_id)
     values(${req.storeId}::uuid,${vid}::uuid,'manual',${variant.quantity},0,'import',${pid},${req.user.id}::uuid)`);
  }
 }
 try{
  await sql.transaction(queries);
 }catch(error){
  if(error.code==="23505"||error.code==="23503")
   return res.status(409).json({error:"Hay un producto o SKU duplicado, o ha cambiado el catálogo durante la importación. No se ha importado parcialmente este lote."});
  throw error;
 }
 res.status(201).json({ok:true,products_created:checked.products.length,variants_created:checked.totalVariants,status:"draft"});
});
storesRouter.put("/:storeId/payments/preferences",requireStore,requirePermission("payments.manage"),async(req,res)=>{const country=String(req.body?.country||"").trim().toUpperCase();const currency=String(req.body?.default_currency||"").trim().toUpperCase();if(!/^[A-Z]{2}$/.test(country)||!/^[A-Z]{3}$/.test(currency))return res.status(400).json({error:"País o divisa inválidos"});const linked=await sql`select provider_account_id,country,default_currency from store_payment_accounts where store_id=${req.storeId}::uuid`;if(linked[0]?.provider_account_id&&(linked[0].country!==country||linked[0].default_currency!==currency))return res.status(409).json({code:"STRIPE_ACCOUNT_IDENTITY_LOCKED",error:"La cuenta Stripe ya está vinculada. El país y la divisa se gestionan desde Stripe Express y no pueden cambiarse aquí."});await sql`insert into store_payment_accounts(store_id,provider,status,country,default_currency) values(${req.storeId}::uuid,'stripe','not_connected',${country},${currency}) on conflict(store_id) do update set country=excluded.country,default_currency=excluded.default_currency,updated_at=now()`;res.json({ok:true,country,default_currency:currency})});
storesRouter.post("/:storeId/payments/connect",requireStore,requirePermission("payments.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe todavía no está configurado en BravoShop"});
 const Stripe=(await import("stripe")).default;const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 let rows=await sql`select provider_account_id,country,default_currency from store_payment_accounts where store_id=${req.storeId}::uuid limit 1`;
 if(!rows.length){
  const fallback=await sql`select ss.settings from store_settings ss where ss.store_id=${req.storeId}::uuid limit 1`;
  const country=/^[A-Z]{2}$/.test(String(fallback[0]?.settings?.country||"").toUpperCase())?String(fallback[0].settings.country).toUpperCase():null;
  const currency=/^[A-Z]{3}$/.test(String(fallback[0]?.settings?.currency||"").toUpperCase())?String(fallback[0].settings.currency).toUpperCase():"EUR";
  rows=await sql`insert into store_payment_accounts(store_id,provider,status,country,default_currency) values(${req.storeId}::uuid,'stripe','not_connected',${country},${currency}) on conflict(store_id) do update set updated_at=now() returning provider_account_id,country,default_currency`;
 }
 let accountId=rows[0]?.provider_account_id;
 if(!accountId){
  if(!rows[0]?.country)return res.status(400).json({error:"Configura el país de la cuenta antes de conectar Stripe"});
  let account;try{account=await stripe.accounts.create({type:"express",country:rows[0].country,capabilities:{card_payments:{requested:true},transfers:{requested:true}},metadata:{bravoshop_store_id:String(req.storeId)}},{idempotencyKey:`bravoshop-connect-${req.storeId}`})}catch(e){const issue=stripeConnectSetupError(e);if(issue)return res.status(409).json(issue);throw e}
  accountId=account.id;
  await sql`update store_payment_accounts set provider_account_id=${accountId},status='onboarding',country=coalesce(${account.country||null},country),updated_at=now() where store_id=${req.storeId}::uuid`;
 }
 const paymentReturn=onboardingReturnUrl(req.storeId);let link;try{link=await stripe.accountLinks.create({account:accountId,refresh_url:paymentReturn+"&payments=refresh",return_url:paymentReturn+"&payments=return",type:"account_onboarding"})}catch(e){const issue=stripeConnectSetupError(e);if(issue)return res.status(409).json(issue);throw e}
 res.json({url:link.url});
});
storesRouter.post("/:storeId/payments/sync",requireStore,requirePermission("payments.manage"),async(req,res)=>{const rows=await sql`select provider_account_id from store_payment_accounts where store_id=${req.storeId}::uuid limit 1`;if(!rows[0]?.provider_account_id)return res.status(404).json({error:"Cuenta Stripe no conectada"});if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe todavía no está configurado en BravoShop"});const Stripe=(await import("stripe")).default;const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);const a=await stripe.accounts.retrieve(rows[0].provider_account_id);const status=connectedAccountStatus(a);await sql`update store_payment_accounts set status=${status},charges_enabled=${Boolean(a.charges_enabled)},payouts_enabled=${Boolean(a.payouts_enabled)},details_submitted=${Boolean(a.details_submitted)},default_currency=coalesce(${a.default_currency?.toUpperCase()||null},default_currency),country=coalesce(${a.country||null},country),updated_at=now() where store_id=${req.storeId}::uuid`;res.json({ok:true,status,charges_enabled:Boolean(a.charges_enabled),payouts_enabled:Boolean(a.payouts_enabled),details_submitted:Boolean(a.details_submitted),requirements:{currently_due:a.requirements?.currently_due||[],past_due:a.requirements?.past_due||[],pending_verification:a.requirements?.pending_verification||[],disabled_reason:a.requirements?.disabled_reason||null}})});
storesRouter.post("/:storeId/payments/dashboard",requireStore,requirePermission("payments.manage"),async(req,res)=>{const rows=await sql`select provider_account_id,status from store_payment_accounts where store_id=${req.storeId}::uuid and provider='stripe' limit 1`;if(!rows[0]?.provider_account_id)return res.status(404).json({error:"Cuenta Stripe no conectada"});if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe todavía no está configurado en BravoShop"});const Stripe=(await import("stripe")).default;const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);try{const link=await stripe.accounts.createLoginLink(rows[0].provider_account_id);res.json({url:link.url})}catch(e){if(rows[0].status!=="active")return res.status(409).json({error:"Completa primero la configuración de Stripe para abrir el panel de cobros"});throw e}});
storesRouter.get("/:storeId/payments",requireStore,requirePermission("payments.read"),async(req,res)=>{
 const platform={connect_ready:Boolean(process.env.STRIPE_SECRET_KEY),checkout_ready:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_CONNECT_WEBHOOK_SECRET)};
 const rows=await sql`select provider,status,provider_account_id,charges_enabled,payouts_enabled,details_submitted,default_currency,country from store_payment_accounts where store_id=${req.storeId}::uuid limit 1`;
 if(rows.length)return res.json({payment_account:rows[0],platform});
 const fallback=await sql`select settings from store_settings where store_id=${req.storeId}::uuid limit 1`;
 res.json({payment_account:{provider:"stripe",status:"not_connected",provider_account_id:null,charges_enabled:false,payouts_enabled:false,details_submitted:false,default_currency:fallback[0]?.settings?.currency||"EUR",country:fallback[0]?.settings?.country||null},platform});
});
storesRouter.get("/:storeId",requireStore,requirePermission("store.read"),async(req,res)=>{const rows=await sql`select s.*,ss.settings,st.theme from stores s left join store_settings ss on ss.store_id=s.id left join store_theme st on st.store_id=s.id where s.id=${req.storeId}::uuid`;if(!rows.length)return res.status(404).json({error:"Tienda no encontrada"});const features=await sql`select feature_key,enabled,config from store_features where store_id=${req.storeId}::uuid`;res.json({store:{...rows[0],role:req.membership.role,permissions:req.permissions,features}})});
storesRouter.patch("/:storeId",requireStore,requirePermission("store.update"),async(req,res)=>{const{name,sector,theme,settings}=req.body||{};if(theme?.template==="premium-organic"&&!await canUsePremiumTemplate(req.storeId)){const existingTheme=await sql`select theme->>'template' as template from store_theme where store_id=${req.storeId}::uuid limit 1`;if(existingTheme[0]?.template!=="premium-organic")return res.status(403).json({error:"La plantilla Premium requiere un plan Premium"});}if(name!==undefined&&(!String(name).trim()||String(name).trim().length>120))return res.status(400).json({error:"Nombre de tienda inválido"});let safeSettings=settings;if(settings!==undefined){safeSettings={...(settings||{})};delete safeSettings.published;delete safeSettings.preview_token}await sql.transaction([...(name!==undefined||sector!==undefined?[sql`update stores set name=coalesce(${name===undefined?null:String(name).trim()},name),sector=coalesce(${sector===undefined?null:sector},sector),updated_at=now() where id=${req.storeId}::uuid`]:[]),...(safeSettings!==undefined?[sql`insert into store_settings(store_id,settings) values(${req.storeId}::uuid,${JSON.stringify(safeSettings||{})}::jsonb) on conflict(store_id) do update set settings=store_settings.settings||excluded.settings`]:[]),...(theme!==undefined?[sql`insert into store_theme(store_id,theme) values(${req.storeId}::uuid,${JSON.stringify(theme||{})}::jsonb) on conflict(store_id) do update set theme=excluded.theme`]:[])]);res.json({ok:true})});
// Limit visual design changes to the theme: managers cannot modify identity or billing.
storesRouter.put("/:storeId/theme",requireStore,requirePermission("design.update"),async(req,res)=>{
 const theme=req.body?.theme;
 if(!theme||typeof theme!=="object"||Array.isArray(theme))return res.status(400).json({error:"Diseño inválido"});
 const raw=JSON.stringify(theme);
 if(raw.length>150000||!Array.isArray(theme.sections)||theme.sections.length>80)
  return res.status(413).json({error:"El diseño excede los límites permitidos"});
 if(theme.sections.some(s=>!s||typeof s!=="object"||typeof s.id!=="string"||s.id.length>120||typeof s.type!=="string"||s.type.length>50))
  return res.status(400).json({error:"Sección de diseño inválida"});
 if(theme.template==="premium-organic"&&!await canUsePremiumTemplate(req.storeId)){
  const existing=await sql`select theme->>'template' as template from store_theme where store_id=${req.storeId}::uuid limit 1`;
  if(existing[0]?.template!=="premium-organic")return res.status(403).json({error:"La plantilla Premium requiere un plan Premium"});
 }
 await sql`insert into store_theme(store_id,theme) values(${req.storeId}::uuid,${raw}::jsonb) on conflict(store_id) do update set theme=excluded.theme`;
 res.json({ok:true});
});
storesRouter.put("/:storeId/features",requireStore,requirePermission("store.update"),async(req,res)=>{const features=Array.isArray(req.body?.features)?req.body.features:[];const clean=[...new Set(features)].filter(x=>MERCHANT_FEATURE_KEYS.has(x));const merchantKeys=[...MERCHANT_FEATURE_KEYS];const queries=[sql`update store_features set enabled=false where store_id=${req.storeId}::uuid and feature_key=any(${merchantKeys})`,...clean.map(feature=>sql`insert into store_features(store_id,feature_key,enabled) values(${req.storeId}::uuid,${feature},true) on conflict(store_id,feature_key) do update set enabled=true`)];await sql.transaction(queries);res.json({features:clean})});

storesRouter.post("/:storeId/publication",requireStore,requirePermission("store.update"),async(req,res)=>{
 const publish=Boolean(req.body?.published);
 const rows=await sql`select s.id,coalesce(ss.settings,'{}'::jsonb) as settings,coalesce(st.theme,'{}'::jsonb) as theme from stores s left join store_settings ss on ss.store_id=s.id left join store_theme st on st.store_id=s.id where s.id=${req.storeId}::uuid limit 1`;
 if(!rows.length)return res.status(404).json({error:"Tienda no encontrada"});
 const current=rows[0],settings=current.settings||{};
 if(publish){
  const billing=await sql`select bravoshop_refresh_store_billing(${req.storeId}::uuid) as status`;
  const products=await sql`select count(*)::int as n from products where store_id=${req.storeId}::uuid and status='active'`;
  const premiumReady=current.theme?.template!=="premium-organic"||await canUsePremiumTemplate(req.storeId);
  const checks={billing:["active","trial"].includes(billing[0]?.status),catalog:products[0].n>0,design:Boolean(current.theme?.template),premium_plan:premiumReady};
  const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
  if(missing.length)return res.status(409).json({error:"La tienda todavía no está lista para publicarse",missing});
 }
 const next={...settings,published:publish,preview_token:settings.preview_token||randomUUID()};
 await sql`insert into store_settings(store_id,settings) values(${req.storeId}::uuid,${JSON.stringify(next)}::jsonb) on conflict(store_id) do update set settings=excluded.settings`;
 res.json({ok:true,published:publish,preview_token:next.preview_token});
});
storesRouter.get("/:storeId/shipping",requireStore,requirePermission("shipping.read"),async(req,res)=>{const zones=await sql`select z.*,coalesce(json_agg(json_build_object('id',r.id,'name',r.name,'price',r.price,'free_over',r.free_over,'min_days',r.min_days,'max_days',r.max_days,'active',r.active)) filter(where r.id is not null),'[]') as rates from shipping_zones z left join shipping_rates r on r.zone_id=z.id and r.store_id=z.store_id where z.store_id=${req.storeId}::uuid group by z.id order by z.created_at`;res.json({zones})});
storesRouter.post("/:storeId/shipping/zones",requireStore,requirePermission("shipping.manage"),async(req,res)=>{const p=req.body||{};if(!String(p.name||"").trim())return res.status(400).json({error:"Nombre requerido"});const countries=[...new Set((Array.isArray(p.countries)?p.countries:[]).map(x=>String(x).toUpperCase()).filter(x=>/^[A-Z]{2}$/.test(x)))];const rows=await sql`insert into shipping_zones(store_id,name,countries) values(${req.storeId}::uuid,${String(p.name).trim()},${countries}) returning *`;res.status(201).json({zone:rows[0]})});
storesRouter.post("/:storeId/shipping/zones/:zoneId/rates",requireStore,requirePermission("shipping.manage"),async(req,res)=>{const p=req.body||{};const zone=await sql`select id from shipping_zones where id=${req.params.zoneId}::uuid and store_id=${req.storeId}::uuid`;if(!zone.length)return res.status(404).json({error:"Zona no encontrada"});const price=Number(p.price||0),free=p.free_over==null||p.free_over===""?null:Number(p.free_over),min=p.min_days==null||p.min_days===""?null:Number(p.min_days),max=p.max_days==null||p.max_days===""?null:Number(p.max_days);if(!String(p.name||"").trim()||!Number.isFinite(price)||price<0||free!==null&&(!Number.isFinite(free)||free<0)||min!==null&&(!Number.isInteger(min)||min<0)||max!==null&&(!Number.isInteger(max)||max<0)||(min!==null&&max!==null&&max<min))return res.status(400).json({error:"Tarifa inválida"});const rows=await sql`insert into shipping_rates(zone_id,store_id,name,price,free_over,min_days,max_days) values(${req.params.zoneId}::uuid,${req.storeId}::uuid,${String(p.name).trim()},${price},${free},${min},${max}) returning *`;res.status(201).json({rate:rows[0]})});
storesRouter.patch("/:storeId/shipping/zones/:zoneId",requireStore,requirePermission("shipping.manage"),async(req,res)=>{
 const p=req.body||{};let name=null,countries=null;
 if(p.name!==undefined){name=String(p.name).trim();if(!name||name.length>120)return res.status(400).json({error:"Nombre de zona inválido"})}
 if(p.countries!==undefined){
  if(!Array.isArray(p.countries))return res.status(400).json({error:"Países inválidos"});
  countries=[...new Set(p.countries.map(x=>String(x).trim().toUpperCase()))];
  if(countries.some(x=>!/^[A-Z]{2}$/.test(x)))return res.status(400).json({error:"Países inválidos"});
 }
 const rows=await sql`update shipping_zones set name=coalesce(${name},name),countries=coalesce(${countries},countries),active=coalesce(${typeof p.active==="boolean"?p.active:null},active) where id=${req.params.zoneId}::uuid and store_id=${req.storeId}::uuid returning *`;
 if(!rows.length)return res.status(404).json({error:"Zona no encontrada"});res.json({zone:rows[0]});
});
storesRouter.delete("/:storeId/shipping/zones/:zoneId",requireStore,requirePermission("shipping.manage"),async(req,res)=>{const rows=await sql`delete from shipping_zones where id=${req.params.zoneId}::uuid and store_id=${req.storeId}::uuid returning id`;if(!rows.length)return res.status(404).json({error:"Zona no encontrada"});res.status(204).end()});
storesRouter.patch("/:storeId/shipping/rates/:rateId",requireStore,requirePermission("shipping.manage"),async(req,res)=>{
 const p=req.body||{};const current=await sql`select * from shipping_rates where id=${req.params.rateId}::uuid and store_id=${req.storeId}::uuid limit 1`;
 if(!current.length)return res.status(404).json({error:"Tarifa no encontrada"});const old=current[0];
 const name=p.name===undefined?old.name:String(p.name).trim();
 const price=p.price===undefined?Number(old.price):Number(p.price);
 const free=p.free_over===undefined?old.free_over:(p.free_over==null||p.free_over===""?null:Number(p.free_over));
 const min=p.min_days===undefined?old.min_days:(p.min_days==null||p.min_days===""?null:Number(p.min_days));
 const max=p.max_days===undefined?old.max_days:(p.max_days==null||p.max_days===""?null:Number(p.max_days));
 if(!name||name.length>120||!Number.isFinite(price)||price<0||free!==null&&(!Number.isFinite(Number(free))||Number(free)<0)||min!==null&&(!Number.isInteger(Number(min))||Number(min)<0)||max!==null&&(!Number.isInteger(Number(max))||Number(max)<0)||(min!==null&&max!==null&&Number(max)<Number(min)))return res.status(400).json({error:"Tarifa inválida"});
 const rows=await sql`update shipping_rates set name=${name},price=${price},free_over=${free},min_days=${min},max_days=${max},active=${typeof p.active==="boolean"?p.active:Boolean(old.active)} where id=${req.params.rateId}::uuid and store_id=${req.storeId}::uuid returning *`;
 res.json({rate:rows[0]});
});
storesRouter.delete("/:storeId/shipping/rates/:rateId",requireStore,requirePermission("shipping.manage"),async(req,res)=>{const rows=await sql`delete from shipping_rates where id=${req.params.rateId}::uuid and store_id=${req.storeId}::uuid returning id`;if(!rows.length)return res.status(404).json({error:"Tarifa no encontrada"});res.status(204).end()});
storesRouter.get("/:storeId/taxes",requireStore,requirePermission("tax.read"),async(req,res)=>{const rows=await sql`select * from store_tax_settings where store_id=${req.storeId}::uuid`;res.json({tax:rows[0]||{enabled:false,prices_include_tax:true,default_rate:0}})});
storesRouter.put("/:storeId/taxes",requireStore,requirePermission("tax.manage"),async(req,res)=>{const rate=Number(req.body?.default_rate||0);if(!Number.isFinite(rate)||rate<0||rate>100)return res.status(400).json({error:"Impuesto inválido"});const rows=await sql`insert into store_tax_settings(store_id,enabled,prices_include_tax,default_rate) values(${req.storeId}::uuid,${Boolean(req.body?.enabled)},${req.body?.prices_include_tax!==false},${rate}) on conflict(store_id) do update set enabled=excluded.enabled,prices_include_tax=excluded.prices_include_tax,default_rate=excluded.default_rate,updated_at=now() returning *`;res.json({tax:rows[0]})});

async function ensurePlanStripePrice(stripe,plan,interval){
 const amount=Math.round(Number(interval==="year"?plan.annual_price:plan.monthly_price)*100);
 if(!Number.isSafeInteger(amount)||amount<=0)throw Object.assign(new Error("Plan without price"),{statusCode:409});
 const currency=String(plan.currency||"EUR").toLowerCase();
 let productId=plan.provider_product_id||null;
 if(productId){try{const p=await stripe.products.retrieve(productId);if(p.deleted)productId=null}catch{productId=null}}
 if(!productId){
  const p=await stripe.products.create({name:`BravoShop ${plan.name}`,metadata:{bravoshop_plan_id:String(plan.id),bravoshop_plan_slug:String(plan.slug)}},{idempotencyKey:`bravoshop-plan-product-${plan.id}`});
  productId=p.id;await sql`update plans set provider_product_id=${productId} where id=${plan.id}::uuid`;
 }
 const column=interval==="year"?"provider_annual_price_id":"provider_monthly_price_id";
 let priceId=plan[column]||null,valid=false;
 if(priceId){try{const price=await stripe.prices.retrieve(priceId);valid=price.active&&price.unit_amount===amount&&price.currency===currency&&price.recurring?.interval===interval}catch{}}
 if(!valid){
  const price=await stripe.prices.create({product:productId,unit_amount:amount,currency,recurring:{interval},metadata:{bravoshop_plan_id:String(plan.id),bravoshop_plan_slug:String(plan.slug),bravoshop_interval:interval}},{idempotencyKey:`bravoshop-plan-price-${plan.id}-${interval}-${currency}-${amount}`});
  priceId=price.id;
  if(interval==="year")await sql`update plans set provider_annual_price_id=${priceId} where id=${plan.id}::uuid`;
  else await sql`update plans set provider_monthly_price_id=${priceId} where id=${plan.id}::uuid`;
 }
 return priceId;
}
async function ensureBillingCustomer(stripe,storeId,currentCustomerId){
 if(currentCustomerId){try{const customer=await stripe.customers.retrieve(currentCustomerId);if(!customer.deleted)return currentCustomerId}catch{}}
 const rows=await sql`select s.name,u.email from stores s join store_members sm on sm.store_id=s.id and sm.role='owner' and sm.status='active' join app_users u on u.id=sm.user_id and u.status='active' where s.id=${storeId}::uuid order by sm.created_at limit 1`;
 if(!rows.length)throw Object.assign(new Error("Store owner missing"),{statusCode:409});
 const customer=await stripe.customers.create({email:rows[0].email,name:rows[0].name,metadata:{bravoshop_billing_store_id:String(storeId)}},{idempotencyKey:`bravoshop-billing-customer-${storeId}`});
 return customer.id;
}
storesRouter.get("/:storeId/billing",requireStore,requirePermission("billing.read"),async(req,res)=>{
 const plans=await sql`select id,name,slug,monthly_price,annual_price,currency,trial_days,metadata from plans where status='active' and is_public=true order by coalesce(monthly_price,999999),name`;
 const current=await sql`select ss.*,p.name as plan_name,p.slug as plan_slug,p.monthly_price,p.annual_price,p.currency from store_subscriptions ss left join plans p on p.id=ss.plan_id where ss.store_id=${req.storeId}::uuid limit 1`;
 res.json({plans,current:current[0]||null,provider_configured:platformBillingConfigured()});
});
storesRouter.post("/:storeId/billing/checkout",requireStore,requirePermission("billing.manage"),async(req,res)=>{
 if(!platformBillingConfigured())return res.status(503).json({error:"La facturación de BravoShop todavía no está completamente configurada"});
 const slug=String(req.body?.plan||"").trim().toLowerCase(),interval=req.body?.interval==="year"?"year":"month";
 const plans=await sql`select * from plans where slug=${slug} and status='active' and is_public=true limit 1`;if(!plans.length)return res.status(404).json({error:"Plan no disponible"});
 const plan=plans[0],listed=interval==="year"?plan.annual_price:plan.monthly_price;if(listed==null||Number(listed)<=0)return res.status(409).json({error:"Este plan todavía no tiene precio para esa modalidad"});
 const Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 const existingRows=await sql`select * from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;const existing=existingRows[0]||null;
 const priceId=await ensurePlanStripePrice(stripe,plan,interval);
 // Reuse the existing checkout for this store/plan/interval while it remains open.
 // Repeated clicks must not create a second payable Stripe session.
 if(existing?.status==="checkout_pending"&&String(existing.plan_id)===String(plan.id)&&existing.billing_interval===interval&&existing.provider_price_id===priceId&&existing.provider_checkout_session_id){
  try{
   const pending=await stripe.checkout.sessions.retrieve(existing.provider_checkout_session_id);
   if(pending.status==="open"&&pending.mode==="subscription"&&pending.url&&pending.client_reference_id===String(req.storeId))
    return res.json({url:pending.url,reused:true});
  }catch(error){
   // A deleted/expired Stripe session is replaceable; provider outages are not.
   if(error.statusCode!==404&&error.code!=="resource_missing")throw error;
  }
 }
 if(existing?.provider_subscription_id){
  const sub=await stripe.subscriptions.retrieve(existing.provider_subscription_id);
  if(["past_due","unpaid","paused","incomplete"].includes(String(sub.status))){
   return res.status(409).json({error:"Actualiza primero el método de pago desde Gestionar facturación.",code:"PAYMENT_ACTION_REQUIRED"});
  }
  if(["active","trialing"].includes(String(sub.status))){
   const item=sub.items?.data?.[0];if(!item)return res.status(409).json({error:"La suscripción actual no tiene una línea modificable"});
   if(item.price?.id===priceId&&!sub.cancel_at_period_end)return res.json({updated:false,unchanged:true,status:sub.status});
   if(req.body?.confirm_change!==true)return res.status(409).json({error:"Confirma el cambio de plan y los posibles prorrateos antes de continuar",code:"BILLING_CHANGE_CONFIRMATION_REQUIRED"});
   const updated=await stripe.subscriptions.update(sub.id,{items:[{id:item.id,price:priceId}],proration_behavior:"create_prorations",cancel_at_period_end:false,metadata:{...sub.metadata,bravoshop_billing_store_id:String(req.storeId),bravoshop_plan_id:String(plan.id),bravoshop_plan_slug:plan.slug,bravoshop_interval:interval}});
   await persistPlatformSubscription(updated,{storeId:req.storeId,planId:plan.id});
   return res.json({updated:true,status:updated.status});
  }
 }
 const customerId=await ensureBillingCustomer(stripe,req.storeId,existing?.provider_customer_id);
 const appUrl=String(process.env.BRAVOSHOP_APP_URL||"https://app.bravoshop.online").replace(/\/$/,"");
 const session=await stripe.checkout.sessions.create({mode:"subscription",customer:customerId,line_items:[{price:priceId,quantity:1}],allow_promotion_codes:true,payment_method_collection:"if_required",success_url:appUrl+"/?billing=success&billing_store="+encodeURIComponent(String(req.storeId)),cancel_url:appUrl+"/?billing=cancelled&billing_store="+encodeURIComponent(String(req.storeId)),client_reference_id:String(req.storeId),metadata:{bravoshop_billing_store_id:String(req.storeId),bravoshop_plan_id:String(plan.id),bravoshop_plan_slug:plan.slug,bravoshop_interval:interval},subscription_data:{metadata:{bravoshop_billing_store_id:String(req.storeId),bravoshop_plan_id:String(plan.id),bravoshop_plan_slug:plan.slug,bravoshop_interval:interval}}},{idempotencyKey:`bravoshop-billing-checkout-${req.storeId}-${plan.id}-${interval}-${Date.now().toString().slice(0,-4)}`});
 await sql`insert into store_subscriptions(store_id,plan_id,status,provider_customer_id,provider_price_id,provider_checkout_session_id,billing_interval,updated_at) values(${req.storeId}::uuid,${plan.id}::uuid,'checkout_pending',${customerId},${priceId},${session.id},${interval},now()) on conflict(store_id) do update set plan_id=excluded.plan_id,status='checkout_pending',provider_customer_id=excluded.provider_customer_id,provider_price_id=excluded.provider_price_id,provider_checkout_session_id=excluded.provider_checkout_session_id,billing_interval=excluded.billing_interval,updated_at=now()`;
 res.json({url:session.url});
});
storesRouter.post("/:storeId/billing/cancel",requireStore,requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"La facturación de BravoShop todavía no está configurada"});
 const rows=await sql`select provider_subscription_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;if(!rows[0]?.provider_subscription_id)return res.status(409).json({error:"No hay una suscripción Stripe activa"});
 const Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);const current=await stripe.subscriptions.retrieve(rows[0].provider_subscription_id);if(["canceled","incomplete_expired"].includes(current.status))return res.status(409).json({error:"Esta suscripción ya ha finalizado; contrata un plan nuevo"});const unchanged=current.cancel_at_period_end===true;const sub=unchanged?current:await stripe.subscriptions.update(current.id,{cancel_at_period_end:true});
 await sql`update store_subscriptions set cancel_at_period_end=true,current_period_end=to_timestamp(${sub.current_period_end||0}),updated_at=now() where store_id=${req.storeId}::uuid`;
 res.json({ok:true,unchanged,cancel_at_period_end:true,current_period_end:sub.current_period_end||null});
});
storesRouter.post("/:storeId/billing/resume",requireStore,requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"La facturación de BravoShop todavía no está configurada"});
 const rows=await sql`select provider_subscription_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;if(!rows[0]?.provider_subscription_id)return res.status(409).json({error:"No hay una suscripción Stripe activa"});
 const Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);const current=await stripe.subscriptions.retrieve(rows[0].provider_subscription_id);if(["canceled","incomplete_expired"].includes(current.status))return res.status(409).json({error:"Esta suscripción ya ha finalizado; contrata un plan nuevo"});const unchanged=current.cancel_at_period_end===false;const sub=unchanged?current:await stripe.subscriptions.update(current.id,{cancel_at_period_end:false});
 await sql`update store_subscriptions set cancel_at_period_end=false,current_period_end=to_timestamp(${sub.current_period_end||0}),updated_at=now() where store_id=${req.storeId}::uuid`;
 res.json({ok:true,unchanged,cancel_at_period_end:false,current_period_end:sub.current_period_end||null});
});
storesRouter.post("/:storeId/billing/portal",requireStore,requirePermission("billing.manage"),async(req,res)=>{
 if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"La facturación de BravoShop todavía no está configurada"});
 const rows=await sql`select provider_customer_id from store_subscriptions where store_id=${req.storeId}::uuid limit 1`;if(!rows[0]?.provider_customer_id)return res.status(409).json({error:"No existe un cliente de facturación"});
 const Stripe=(await import("stripe")).default,stripe=new Stripe(process.env.STRIPE_SECRET_KEY);const appUrl=String(process.env.BRAVOSHOP_APP_URL||"https://app.bravoshop.online").replace(/\/$/,"");
 const portal=await stripe.billingPortal.sessions.create({customer:rows[0].provider_customer_id,return_url:appUrl});
 res.json({url:portal.url});
});

storesRouter.post("/:storeId/access-codes/redeem",codeRedemptionLimiter,requireStore,requirePermission("billing.manage"),async(req,res)=>{const code=String(req.body?.code||"").trim().toUpperCase();if(!code)return res.status(400).json({error:"Escribe un código"});const rows=await sql`select bravoshop_redeem_access_code(${code},${req.storeId}::uuid,${req.user.id}::uuid) as result`;const result=rows[0]?.result;if(!result?.ok){const reason=result?.error;const map={invalid:[404,"Código no válido, caducado o sin usos disponibles"],already_redeemed:[409,"Esta tienda ya utilizó este código"],unsupported:[400,"Tipo de código no compatible"]};const[status,message]=map[reason]||[400,"No se pudo canjear el código"];return res.status(status).json({error:message})}let storeStatus=req.store?.status||null;if(result.grant_type==="plan"){const refreshed=await sql`select bravoshop_refresh_store_billing(${req.storeId}::uuid) as status`;storeStatus=refreshed[0]?.status||storeStatus}res.json({ok:true,grant_type:result.grant_type,feature_key:result.feature_key,permanent:result.permanent,store_status:storeStatus})});
storesRouter.get("/:storeId/entitlements",requireStore,requirePermission("billing.read"),async(req,res)=>{const rows=await sql`select feature_key,permanent,ends_at,limits,source from store_feature_entitlements where store_id=${req.storeId}::uuid and (permanent=true or ends_at is null or ends_at>now())`;res.json({entitlements:rows})});

storesRouter.get("/:storeId/features/effective",requireStore,requirePermission("store.read"),async(req,res)=>{const configured=await sql`select feature_key from store_features where store_id=${req.storeId}::uuid and enabled=true`;const plan=await sql`select p.slug,p.name,pf.feature_key from store_subscriptions ss join plans p on p.id=ss.plan_id left join plan_features pf on pf.plan_id=p.id and pf.enabled=true where ss.store_id=${req.storeId}::uuid and (ss.status='active' or (ss.status='trialing' and (ss.trial_ends_at is null or ss.trial_ends_at>now()))) and (ss.complimentary_reason is null or ss.complimentary_until is null or ss.complimentary_until>now())`;const granted=await sql`select feature_key,permanent,ends_at,limits from store_feature_entitlements where store_id=${req.storeId}::uuid and (permanent=true or ends_at is null or ends_at>now())`;const ai=new Set(["ai_assistant","ai_images","image_analysis"]);const planKeys=plan.map(x=>x.feature_key).filter(Boolean);const ordinary=configured.map(x=>x.feature_key).filter(x=>!ai.has(x));const keys=[...new Set([...ordinary,...planKeys,...granted.map(x=>x.feature_key)])];res.json({features:keys,plan:plan[0]?{slug:plan[0].slug,name:plan[0].name}:null,entitlements:granted})});
