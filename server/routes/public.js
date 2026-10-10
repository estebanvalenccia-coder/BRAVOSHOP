import{Router}from"express";import{randomUUID}from"node:crypto";import{sql}from"../db/neon.js";import{normalizePublicHost,selectPublicStoreHost}from"../security/publicHost.js";import{isPreviewContentRequest}from"../security/publicPreviewRoutes.js";import Stripe from"stripe";import{checkoutLimiter,newsletterLimiter}from"../middleware/rateLimit.js";
import{requiresCurrencyMinorUnitUpgrade,isValidTwoDecimalStripeAmount,meetsStripeMinimumCharge,merchantStripeAccountReady,checkoutControlEnabled}from"../services/paymentCurrency.js";
import{validateCheckoutAddress}from"../services/checkoutAddress.js";
export const publicRouter=Router();
publicRouter.get("/plans",async(_req,res)=>{const rows=await sql`select name,slug,monthly_price,annual_price,currency,trial_days,metadata from plans where status=\'active\' and is_public=true order by coalesce(monthly_price,999999),name`;res.json({plans:rows})});
publicRouter.param("token",(req,res,next,token)=>{
	if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))return res.status(404).json({error:"Checkout no encontrado o caducado"});
	next();
});
publicRouter.use((req,res,next)=>{
	if(req.method!=="POST"||req.path!=="/checkout")return next();
	return checkoutLimiter(req,res,()=>validateCheckoutBody(req,res,next));
});
function validateCheckoutBody(req,res,next){
	const items=req.body?.items;
	if(!Array.isArray(items)||items.length<1||items.length>50)return res.status(400).json({error:"Carrito inválido"});
	const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	if(items.some(item=>!item||typeof item!=="object"||!uuid.test(item.variant_id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>99))return res.status(400).json({error:"Cantidad o variante no válida"});
 if(new Set(items.map(item=>item.variant_id.toLowerCase())).size!==items.length)return res.status(400).json({error:"El carrito contiene variantes duplicadas"});
	if(typeof req.body.email!=="string")return res.status(400).json({error:"El email de contacto es obligatorio"});
 req.body.email=req.body.email.trim().toLowerCase();
 if(!req.body.email||req.body.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email))return res.status(400).json({error:"Email no válido"});
	if(req.body.currency!==undefined&&(typeof req.body.currency!=="string"||! /^[A-Za-z]{3}$/.test(req.body.currency)))return res.status(400).json({error:"Moneda no válida"});
	if(req.body.discount_code!==undefined&&(typeof req.body.discount_code!=="string"||req.body.discount_code.length>80))return res.status(400).json({error:"Código de descuento no válido"});
	if(req.body.recovery_consent!==undefined&&typeof req.body.recovery_consent!=="boolean")return res.status(400).json({error:"Consentimiento de recuperación no válido"});
	if(req.body.shipping_rate_id!==undefined&&(typeof req.body.shipping_rate_id!=="string"||!uuid.test(req.body.shipping_rate_id)))return res.status(400).json({error:"Tarifa de envío no válida"});
	const address=req.body.shipping_address??{};
	if(!address||typeof address!=="object"||Array.isArray(address))return res.status(400).json({error:"Dirección no válida"});
	const fields=["name","phone","line1","line2","city","region","postal_code","country"];
	for(const key of fields){
		if(address[key]!==undefined&&(typeof address[key]!=="string"||address[key].length>(key==="line1"||key==="line2"?500:120)))return res.status(400).json({error:"Dirección no válida"});
	}
	if(address.country!==undefined&&! /^[A-Za-z]{2}$/.test(address.country))return res.status(400).json({error:"País no válido"});
	req.body.shipping_address=Object.fromEntries(fields.filter(key=>address[key]!==undefined).map(key=>[key,address[key]]));
	next();
}
const reservedSubdomains=new Set(["www","api","admin","app","support","status","mail","cdn","assets","static","dashboard","billing","auth","login","register","help","ftp","pop","smtp","autoconfig","store","stores","shop","checkout","webhook","webhooks","docs","developer","developers","dev","staging","test","internal","root","security","contact","notifications","imap","pop3","ns1","ns2","mx","email","media","images","files","uploads","download","downloads","public","private","system","platform"]);
const publicSettingKeys=["currency","locale","headline","subheadline","about","store_description","contact_email","contact_phone","seo_title","seo_description","legal_name","legal_email","legal_phone","tax_id","legal_address","privacy_email","privacy_notes","shipping_policy","returns_days","returns_policy"];
function publicSettings(settings={}){return Object.fromEntries(publicSettingKeys.filter(key=>Object.hasOwn(settings,key)).map(key=>[key,settings[key]]))}
async function publicFeatureEnabled(storeId,key){const rows=await sql`select 1 from store_features where store_id=${storeId}::uuid and feature_key=${key} and enabled=true limit 1`;return rows.length>0}
async function resolveStore(hostInput){
	const host=normalizePublicHost(hostInput);if(!host)return null;
	if(host.endsWith(".bravoshop.online")){
		const labels=host.split(".");
		if(labels.length!==3||reservedSubdomains.has(labels[0]))return null;
		const rows=await sql`select s.*,ss.settings,st.theme from stores s left join store_settings ss on ss.store_id=s.id left join store_theme st on st.store_id=s.id where s.slug=${labels[0]} and s.status<>'scheduled_for_deletion' limit 1`;
		return rows[0]||null;
	}
	const rows=await sql`select s.*,ss.settings,st.theme from domains d join stores s on s.id=d.store_id left join store_settings ss on ss.store_id=s.id left join store_theme st on st.store_id=s.id where lower(d.hostname)=${host} and d.kind='custom' and d.status='verified' and s.status<>'scheduled_for_deletion' limit 1`;
	return rows[0]||null;
}
async function requirePublicStore(req,res,next){
 if(req.method==="POST"&&req.path==="/checkout")await sql`select bravoshop_release_expired_inventory_reservations()`;
 const previewToken=typeof req.query.preview_token==="string"?req.query.preview_token:"";
 const previewReadable=isPreviewContentRequest(req.method,req.path);
 const platformPreview=previewReadable&&req.get("origin")==="https://app.bravoshop.online"&&previewToken.length>0;
 const selection=selectPublicStoreHost({
  requestedHost:req.query.host||req.body?.host,
  origin:req.get("origin"),
  requestHost:req.get("host"),
  allowPlatformPreview:platformPreview
 });
 if(selection.conflict)return res.status(400).json({error:"La tienda solicitada no coincide con el origen"});
 const store=selection.host?await resolveStore(selection.host):null;
 if(!store)return res.status(404).json({error:"Tienda no encontrada"});
 // A preview token is a read-only capability: it never activates payments or publication.
 const tokenMatches=previewReadable&&previewToken.length>=32&&previewToken===String(store.settings?.preview_token||"");
 if(platformPreview&&!tokenMatches)return res.status(403).json({error:"Vista previa no autorizada"});
 const billingState=await sql`select bravoshop_refresh_store_billing(${store.id}::uuid) as status`;
 store.status=billingState[0]?.status||store.status;
 if(!["active","trial"].includes(store.status)&&!tokenMatches)return res.status(423).json({error:"Tienda no disponible"});
 if(store.settings?.published!==true&&!tokenMatches)return res.status(423).json({error:"Esta tienda todavía no está publicada"});
 req.previewStore=Boolean(tokenMatches);
 req.publicStore=store;
 next();
}
publicRouter.get("/store",requirePublicStore,async(req,res)=>{
 const[features,payments,controls,shipping]=await Promise.all([
  sql`select feature_key,enabled from store_features where store_id=${req.publicStore.id}::uuid and enabled=true`,
  sql`select provider,status,provider_account_id,charges_enabled,payouts_enabled from store_payment_accounts where store_id=${req.publicStore.id}::uuid limit 1`,
  sql`select enabled from platform_controls where key='checkout' limit 1`,
  sql`select count(distinct z.id)::int as value from shipping_zones z join shipping_rates r on r.zone_id=z.id and r.store_id=z.store_id and r.active=true where z.store_id=${req.publicStore.id}::uuid and z.active=true`
 ]);
 const payment=payments[0],settings=req.publicStore.settings||{};
 const checkoutEnabled=!controls.length||controls[0].enabled===true;
 const legalReady=["legal_name","tax_id","legal_address","legal_email"].every(k=>String(settings[k]||"").trim());
 const notificationsReady=Boolean(process.env.RESEND_API_KEY&&process.env.BRAVOSHOP_EMAIL_FROM);
 const shippingReady=req.publicStore.sector==="services"||Number(shipping[0]?.value||0)>0;
 const paymentsReady=Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_CONNECT_WEBHOOK_SECRET&&payment?.provider==="stripe"&&payment?.status==="active"&&payment?.provider_account_id&&payment?.charges_enabled&&payment?.payouts_enabled);
 const checkoutReady=Boolean(!req.previewStore&&checkoutEnabled&&legalReady&&notificationsReady&&shippingReady&&paymentsReady);
 res.json({store:{name:req.publicStore.name,slug:req.publicStore.slug,sector:req.publicStore.sector,preview:Boolean(req.previewStore),theme:req.publicStore.theme||{},settings:publicSettings(settings),features,commerce:{checkout_ready:checkoutReady,legal_ready:legalReady,shipping_ready:shippingReady,notifications_ready:notificationsReady,payments_ready:paymentsReady}}});
});
publicRouter.post("/newsletter/subscribe",newsletterLimiter,requirePublicStore,async(req,res)=>{
 const email=String(req.body?.email||"").trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({error:"Email no válido"});
 if(req.body?.consent!==true)return res.status(400).json({error:"Debes aceptar recibir comunicaciones comerciales"});
 const rows=await sql`
  insert into newsletter_subscribers(store_id,email,status,consent_at,unsubscribed_at,source,updated_at)
  values(${req.publicStore.id}::uuid,${email},'active',now(),null,'storefront',now())
  on conflict(store_id,lower(email)) do update
   set status='active',consent_at=now(),unsubscribed_at=null,source='storefront',unsubscribe_token=gen_random_uuid(),updated_at=now()
  returning id,email,status,consent_at`;
 res.status(201).json({subscription:{email:rows[0].email,status:rows[0].status,consent_at:rows[0].consent_at}});
});
publicRouter.get("/newsletter/unsubscribe/:token",newsletterLimiter,async(req,res)=>{
 const token=String(req.params.token||"");
 if(/^[0-9a-f-]{36}$/i.test(token)){
  await sql`update newsletter_subscribers set status='unsubscribed',unsubscribed_at=coalesce(unsubscribed_at,now()),updated_at=now() where unsubscribe_token=${token}::uuid`;
 }
 res.status(200).type("html").send('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Baja confirmada</title><body style="margin:0;background:#f5f5f3;font-family:Arial,sans-serif;color:#171717"><main style="max-width:620px;margin:80px auto;padding:20px"><div style="background:#fff;border-radius:18px;padding:36px"><small>BRAVOSHOP</small><h1>Baja confirmada</h1><p>Ya no recibirás campañas comerciales de esta tienda. Si algún día quieres volver, podrás suscribirte de nuevo desde su web.</p></div></main></body></html>');
});
publicRouter.post("/newsletter/unsubscribe/:token",newsletterLimiter,async(req,res)=>{
 const token=String(req.params.token||"");
 if(!/^[0-9a-f-]{36}$/i.test(token))return res.status(404).json({error:"Enlace de baja no válido"});
 const rows=await sql`
  update newsletter_subscribers
  set status='unsubscribed',unsubscribed_at=now(),updated_at=now()
  where unsubscribe_token=${token}::uuid
  returning id`;
 if(!rows.length)return res.status(404).json({error:"Suscripción no encontrada"});
 res.json({ok:true});
});
publicRouter.get("/payment-config",requirePublicStore,async(req,res)=>{
 if(!await publicFeatureEnabled(req.publicStore.id,"checkout"))return res.status(503).json({error:"El checkout está desactivado"});
 const controls=await sql`select enabled from platform_controls where key='checkout' limit 1`;
 if(!checkoutControlEnabled(controls))return res.status(503).json({error:"Checkout temporalmente desactivado"});
 const rows=await sql`select provider,status,provider_account_id,charges_enabled,payouts_enabled from store_payment_accounts where store_id=${req.publicStore.id}::uuid limit 1`;
 const p=rows[0];
 if(!merchantStripeAccountReady(p))return res.status(503).json({error:"La cuenta Stripe de la tienda no está habilitada para cobros y transferencias"});
 const publishableKey=process.env.STRIPE_PUBLISHABLE_KEY;
 if(!publishableKey||!publishableKey.startsWith("pk_"))return res.status(503).json({error:"Stripe público pendiente de configuración"});
 res.json({provider:"stripe",publishable_key:publishableKey,account_id:p.provider_account_id});
});
publicRouter.get("/blog/posts",requirePublicStore,async(req,res)=>{
 if(!await publicFeatureEnabled(req.publicStore.id,"blog"))return res.status(404).json({error:"Blog no disponible"});
 const rows=await sql`select b.id,b.title,b.slug,b.excerpt,b.published_at,m.public_url as cover_url
 from store_blog_posts b left join media_assets m on m.id=b.cover_media_id and m.store_id=b.store_id and m.visibility='public'
 where b.store_id=${req.publicStore.id}::uuid and b.status='published'
 order by b.published_at desc,b.id desc limit 100`;
 res.json({posts:rows});
});
publicRouter.get("/blog/posts/:slug",requirePublicStore,async(req,res)=>{
 if(!await publicFeatureEnabled(req.publicStore.id,"blog"))return res.status(404).json({error:"Blog no disponible"});
 const slug=String(req.params.slug||"");
 if(slug.length>120||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return res.status(404).json({error:"Artículo no encontrado"});
 const rows=await sql`select b.id,b.title,b.slug,b.excerpt,b.content,b.published_at,m.public_url as cover_url
 from store_blog_posts b left join media_assets m on m.id=b.cover_media_id and m.store_id=b.store_id and m.visibility='public'
 where b.store_id=${req.publicStore.id}::uuid and b.status='published' and b.slug=${slug} limit 1`;
 if(!rows.length)return res.status(404).json({error:"Artículo no encontrado"});
 res.json({post:rows[0]});
});
// Search engines only receive published, tenant-scoped resources. Preview tokens
// cannot access these routes, which are intentionally outside preview read grants.
publicRouter.get("/seo/count",requirePublicStore,async(req,res)=>{
 const result=await sql`select count(*)::int as total from products where store_id=${req.publicStore.id}::uuid and status='active'`;
 res.set("Cache-Control","public, max-age=600").json({total:result[0]?.total||0});
});
publicRouter.get("/seo/products",requirePublicStore,async(req,res)=>{
 const offset=Number(req.query.offset);
 if(!Number.isSafeInteger(offset)||offset<0||offset>500000||offset%1000!==0)return res.status(400).json({error:"Página inválida"});
 const rows=await sql`select slug from products where store_id=${req.publicStore.id}::uuid and status='active' and slug is not null order by slug,id limit 1000 offset ${offset}`;
 res.set("Cache-Control","public, max-age=600").json({products:rows});
});
publicRouter.get("/seo/pages",requirePublicStore,async(req,res)=>{
 const [categories,posts]=await Promise.all([
  sql`select slug from categories where store_id=${req.publicStore.id}::uuid and active=true order by slug`,
  publicFeatureEnabled(req.publicStore.id,"blog").then(enabled=>enabled?sql`select slug from store_blog_posts where store_id=${req.publicStore.id}::uuid and status='published' order by slug`:[])
 ]);
 res.set("Cache-Control","public, max-age=600").json({categories,posts});
});
publicRouter.get("/products",requirePublicStore,async(req,res)=>{
 const limit=Math.min(100,Math.max(1,Number.parseInt(String(req.query.limit||"48"),10)||48));
 const offset=Math.min(100000,Math.max(0,Number.parseInt(String(req.query.offset||"0"),10)||0));
 const q=String(req.query.q||"").trim().slice(0,120);
 const category=String(req.query.category||"all").trim().slice(0,120);
 const sort=["featured","price-asc","price-desc","name","newest"].includes(req.query.sort)?req.query.sort:"featured";
 const priceRaw=req.query.price_max;
 const maxPrice=priceRaw!==undefined&&priceRaw!==""&&Number.isFinite(Number(priceRaw))&&Number(priceRaw)>=0?Number(priceRaw):null;
 const storeId=req.publicStore.id;
 const rows=await sql`
 select p.id,p.name,p.slug,p.description,p.price,p.product_type,p.vendor,p.created_at,p.published_at,
 (select m.public_url from product_media pm join media_assets m on m.id=pm.media_id where pm.product_id=p.id and pm.store_id=p.store_id and m.store_id=p.store_id and m.visibility='public' order by pm.is_primary desc,pm.position limit 1) as image_url,
 coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug) order by c.position,c.name) from product_categories pc join categories c on c.id=pc.category_id and c.store_id=p.store_id where pc.product_id=p.id and pc.store_id=p.store_id and c.active=true),'[]'::jsonb) as categories
 from products p
 where p.store_id=${storeId}::uuid and p.status='active'
 and (${q}='' or coalesce(p.name,'') ilike '%'||${q}||'%' or coalesce(p.product_type,'') ilike '%'||${q}||'%' or coalesce(p.vendor,'') ilike '%'||${q}||'%' or coalesce(p.description,'') ilike '%'||${q}||'%')
 and (${category}='all' or exists(select 1 from product_categories pc join categories c on c.id=pc.category_id and c.store_id=pc.store_id where pc.product_id=p.id and pc.store_id=p.store_id and c.active=true and c.slug=${category}))
 and (${maxPrice}::numeric is null or p.price<=${maxPrice}::numeric)
 order by
 case when ${sort}='price-asc' then p.price end asc nulls last,
 case when ${sort}='price-desc' then p.price end desc nulls last,
 case when ${sort}='name' then p.name end asc nulls last,
 case when ${sort}='newest' then coalesce(p.published_at,p.created_at) end desc nulls last,
 p.published_at desc nulls last,p.created_at desc,p.id desc
 limit ${limit+1} offset ${offset}`;
 const hasMore=rows.length>limit;
 res.json({products:rows.slice(0,limit),page:{limit,offset,has_more:hasMore,next_offset:hasMore?offset+limit:null}});
});
publicRouter.get("/categories",requirePublicStore,async(req,res)=>{const rows=await sql`select c.id,c.name,c.slug,c.description,c.position,count(pc.product_id) filter(where p.status='active')::int as product_count,(select m.public_url from product_categories pc2 join products p2 on p2.id=pc2.product_id and p2.store_id=c.store_id and p2.status='active' join product_media pm on pm.product_id=p2.id and pm.store_id=c.store_id join media_assets m on m.id=pm.media_id and m.store_id=c.store_id and m.visibility='public' where pc2.category_id=c.id and pc2.store_id=c.store_id order by pm.is_primary desc,pm.position,p2.published_at desc nulls last limit 1) as image_url from categories c left join product_categories pc on pc.category_id=c.id and pc.store_id=c.store_id left join products p on p.id=pc.product_id and p.store_id=c.store_id where c.store_id=${req.publicStore.id}::uuid and c.active=true group by c.id order by c.position,c.name`;res.json({categories:rows})});
publicRouter.get("/products/:slug",requirePublicStore,async(req,res)=>{const rows=await sql`select id,name,slug,description,price,product_type,vendor,metadata,seo from products where store_id=${req.publicStore.id}::uuid and slug=${req.params.slug} and status='active' limit 1`;if(!rows.length)return res.status(404).json({error:"Producto no encontrado"});const variants=await sql`select v.id,v.title,coalesce(v.price,p.price) as price,v.compare_at_price,v.options,v.sku,case when coalesce(i.track_inventory,true)=false or coalesce(i.allow_backorder,false) then true else coalesce(i.quantity,0)-coalesce(i.reserved,0)>0 end as in_stock from product_variants v join products p on p.id=v.product_id left join inventory_levels i on i.variant_id=v.id where v.product_id=${rows[0].id}::uuid and v.store_id=${req.publicStore.id}::uuid and p.store_id=${req.publicStore.id}::uuid and v.active=true order by v.created_at`;const media=await sql`select m.public_url,m.alt_text,pm.position,pm.is_primary from product_media pm join media_assets m on m.id=pm.media_id where pm.product_id=${rows[0].id}::uuid and pm.store_id=${req.publicStore.id}::uuid and m.store_id=${req.publicStore.id}::uuid and m.visibility='public' order by pm.is_primary desc,pm.position`;const categories=await sql`select c.id,c.name,c.slug from categories c join product_categories pc on pc.category_id=c.id and pc.store_id=c.store_id where pc.product_id=${rows[0].id}::uuid and pc.store_id=${req.publicStore.id}::uuid and c.store_id=${req.publicStore.id}::uuid and c.active=true order by c.position,c.name`;const related=await sql`select p.id,p.name,p.slug,p.price,p.product_type,p.vendor,(select m.public_url from product_media pm2 join media_assets m on m.id=pm2.media_id where pm2.product_id=p.id and pm2.store_id=p.store_id and m.store_id=p.store_id and m.visibility='public' order by pm2.is_primary desc,pm2.position limit 1) as image_url from products p where p.store_id=${req.publicStore.id}::uuid and p.status='active' and p.id<>${rows[0].id}::uuid and (exists(select 1 from product_categories candidate_pc join product_categories current_pc on current_pc.category_id=candidate_pc.category_id and current_pc.store_id=candidate_pc.store_id where candidate_pc.product_id=p.id and candidate_pc.store_id=${req.publicStore.id}::uuid and current_pc.product_id=${rows[0].id}::uuid and current_pc.store_id=${req.publicStore.id}::uuid) or (${rows[0].product_type||null} is not null and p.product_type=${rows[0].product_type||null})) order by p.created_at desc limit 4`;res.json({product:{...rows[0],variants,media,categories,related}})});
publicRouter.get("/shipping-rates",requirePublicStore,async(req,res)=>{
 const country=String(req.query.country||"").trim().toUpperCase();
 const subtotal=Number(req.query.subtotal||0);
 if(!/^[A-Z]{2}$/.test(country)||!Number.isFinite(subtotal)||subtotal<0)return res.status(400).json({error:"País o subtotal no válido"});
 const zones=await sql`select count(*)::int as n from shipping_zones where store_id=${req.publicStore.id}::uuid and active=true`;
 const rows=await sql`
  select r.id,r.name,r.price,r.free_over,r.min_days,r.max_days,z.name as zone_name
  from shipping_rates r join shipping_zones z on z.id=r.zone_id and z.store_id=r.store_id
  where r.store_id=${req.publicStore.id}::uuid and z.active=true and r.active=true and ${country}=any(z.countries)
  order by r.price asc,r.name asc`;
 if(!rows.length&&zones[0].n>0)return res.status(422).json({error:"Esta tienda no realiza envíos al país indicado"});
 res.json({rates:rows.map(r=>({...r,effective_price:r.free_over!==null&&subtotal>=Number(r.free_over)?0:Number(r.price)}))});
});
publicRouter.post("/checkout",requirePublicStore,async(req,res)=>{
	if(!await publicFeatureEnabled(req.publicStore.id,"checkout"))return res.status(503).json({error:"La tienda no tiene el checkout activado"});
	const controls=await sql`select enabled from platform_controls where key='checkout' limit 1`;
	if(!checkoutControlEnabled(controls))return res.status(503).json({error:"Checkout temporalmente desactivado"});
	const settings=req.publicStore.settings||{};
 const legalReady=["legal_name","tax_id","legal_address","legal_email"].every(k=>String(settings[k]||"").trim());
 if(!legalReady)return res.status(503).json({error:"Completa la información legal antes de aceptar pedidos"});
 if(!process.env.RESEND_API_KEY||!process.env.BRAVOSHOP_EMAIL_FROM)return res.status(503).json({error:"El servicio de confirmaciones por email todavía no está configurado"});
 if(req.publicStore.sector!=="services"){
  const shippingReady=await sql`select count(distinct z.id)::int as value from shipping_zones z join shipping_rates r on r.zone_id=z.id and r.store_id=z.store_id and r.active=true where z.store_id=${req.publicStore.id}::uuid and z.active=true`;
  if(Number(shippingReady[0]?.value||0)<1)return res.status(503).json({error:"Configura al menos una zona y tarifa de envío antes de aceptar pedidos"});
 }
 const paymentRows=await sql`select provider,status,provider_account_id,charges_enabled,payouts_enabled,default_currency from store_payment_accounts where store_id=${req.publicStore.id}::uuid limit 1`;
	const paymentAccount=paymentRows[0];
	const platformPaymentsReady=Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PUBLISHABLE_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
	if(!platformPaymentsReady||!merchantStripeAccountReady(paymentAccount))return res.status(503).json({error:"La tienda todavía no está lista para aceptar pagos"});
	const delivery=validateCheckoutAddress(req.body.shipping_address,{
  requiresShipping:req.publicStore.sector!=="services"
 });
 if(!delivery.ok)return res.status(422).json({error:delivery.error});
 req.body.shipping_address=delivery.address;
	const normalized=[];
	let subtotalCents=0;
	for(const item of req.body.items){
		const rows=await sql`
			select v.id as variant_id,v.sku,v.title as variant_title,
				coalesce(v.price,p.price)::numeric as unit_price,p.id as product_id,p.name as product_name,
				p.status,coalesce(i.quantity,0)::int as quantity,coalesce(i.reserved,0)::int as reserved,
				coalesce(i.track_inventory,true) as track_inventory,
				coalesce(i.allow_backorder,false) as allow_backorder
			from product_variants v
			join products p on p.id=v.product_id
			left join inventory_levels i on i.variant_id=v.id
			where v.id=${item.variant_id}::uuid and v.store_id=${req.publicStore.id}::uuid and p.store_id=${req.publicStore.id}::uuid and v.active=true
			limit 1
		`;
		if(!rows.length||rows[0].status!=="active")return res.status(400).json({error:"Hay un producto no disponible"});
		const product=rows[0];
		const available=product.quantity-product.reserved;
		if(product.track_inventory&&!product.allow_backorder&&available<item.quantity)return res.status(409).json({error:`Stock insuficiente para ${product.product_name}`});
		const unitPriceCents=Math.round(Number(product.unit_price)*100);
  if(!Number.isSafeInteger(unitPriceCents)||unitPriceCents<0)return res.status(409).json({error:"Este producto tiene un precio inválido. Contacta con la tienda."});
		const lineTotalCents=unitPriceCents*item.quantity;
		if(!Number.isSafeInteger(lineTotalCents)||!Number.isSafeInteger(subtotalCents+lineTotalCents))return res.status(400).json({error:"Importe del carrito no válido"});
		subtotalCents+=lineTotalCents;
		normalized.push({...product,quantity:item.quantity,unit_price:unitPriceCents/100,total:lineTotalCents/100});
	}

	const currency=String(paymentAccount.default_currency||req.publicStore.settings?.currency||"EUR").toUpperCase();
	if(req.body.currency&&String(req.body.currency).toUpperCase()!==currency)return res.status(400).json({error:"Moneda no válida para esta tienda"});
 if(requiresCurrencyMinorUnitUpgrade(currency))return res.status(422).json({error:"Esta moneda necesita validación específica de importes antes de habilitar pagos en BravoShop"});
	const address=req.body.shipping_address;
	const country=String(address.country||"").trim().toUpperCase();
	const zones=await sql`select count(*)::int as n from shipping_zones where store_id=${req.publicStore.id}::uuid and active=true`;
	if(zones[0].n>0&&!/^[A-Z]{2}$/.test(country))return res.status(400).json({error:"Indica un país de entrega válido"});
	let shippingCents=0,shippingRateId=null,shippingRateName=null;
	if(country){
		const requestedRate=req.body.shipping_rate_id||null;
		const rates=await sql`
			select r.id,r.name,r.price,r.free_over
			from shipping_rates r
			join shipping_zones z on z.id=r.zone_id and z.store_id=r.store_id
			where r.store_id=${req.publicStore.id}::uuid and z.active=true and r.active=true
				and ${country}=any(z.countries)
				and (${requestedRate}::uuid is null or r.id=${requestedRate}::uuid)
			order by r.price asc
			limit 1
		`;
		if(!rates.length&&zones[0].n>0)return res.status(422).json({error:"Esta tienda no realiza envíos al país indicado"});
		if(rates.length){
			const priceCents=Math.round(Number(rates[0].price)*100);
			const freeOverCents=rates[0].free_over===null?null:Math.round(Number(rates[0].free_over)*100);
			shippingCents=freeOverCents!==null&&subtotalCents>=freeOverCents?0:priceCents;
			shippingRateId=rates[0].id;
			shippingRateName=rates[0].name;
		}
	}

	let discountCode=null,discountCents=0;
	const requestedCode=String(req.body.discount_code||"").trim().toUpperCase();
	if(requestedCode){
		if(!await publicFeatureEnabled(req.publicStore.id,"coupons"))return res.status(422).json({error:"Los códigos de descuento no están activados en esta tienda"});
		const quoted=await sql`
			select code,greatest(0,least(${subtotalCents/100}::numeric,
				case when kind='percent' then round(${subtotalCents/100}::numeric*(value/100),2) else value end
			)) as discount_amount
			from discount_codes
			where store_id=${req.publicStore.id}::uuid and upper(code)=upper(${requestedCode})
				and active=true and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())
				and (usage_limit is null or usage_count<usage_limit)
				and ${subtotalCents/100}::numeric>=minimum_amount
			limit 1`;
		if(!quoted.length||Number(quoted[0].discount_amount)<=0)return res.status(422).json({error:"Código de descuento no válido, caducado o no aplicable"});
		discountCode=quoted[0].code;discountCents=Math.round(Number(quoted[0].discount_amount)*100);
	}
	const taxableSubtotalCents=Math.max(0,subtotalCents-discountCents);
	const taxRows=await sql`select enabled,prices_include_tax,default_rate from store_tax_settings where store_id=${req.publicStore.id}::uuid limit 1`;
	const taxConfig=taxRows[0];
	const taxCents=taxConfig?.enabled&&!taxConfig.prices_include_tax
		?Math.round(taxableSubtotalCents*(Number(taxConfig.default_rate)/100))
		:0;
	const totalCents=taxableSubtotalCents+shippingCents+taxCents;
	if(!Number.isSafeInteger(totalCents)||!isValidTwoDecimalStripeAmount(totalCents/100))return res.status(422).json({error:"El importe excede los límites de cobro admitidos para esta moneda"});
 if(!meetsStripeMinimumCharge(totalCents,currency))return res.status(422).json({error:"El total es inferior al mínimo de cobro de Stripe. Añade productos o ajusta el descuento"});
	const subtotal=subtotalCents/100;
	const discount=discountCents/100;
	const shipping=shippingCents/100;
	const tax=taxCents/100;
	const total=totalCents/100;
	const id=randomUUID();
	const token=randomUUID();
	const addressJson=JSON.stringify(address);
	const queries=[
		...(discountCode?[sql`select bravoshop_claim_discount_exact(${req.publicStore.id}::uuid,${discountCode},${subtotal},${discount})`]:[]),
		sql`
			insert into checkout_sessions(
				id,store_id,token,status,currency,subtotal,discount_total,discount_code,shipping_total,shipping_rate_id,shipping_rate_name,tax_total,total,customer_email,shipping_address,recovery_consent
			) values(
				${id}::uuid,${req.publicStore.id}::uuid,${token}::uuid,'open',${currency},
				${subtotal},${discount},${discountCode},${shipping},${shippingRateId}::uuid,${shippingRateName},${tax},${total},${req.body.email||null},${addressJson}::jsonb,${Boolean(req.body.recovery_consent)}
			)
		`,
		...normalized.map(item=>sql`
			insert into checkout_items(
				id,checkout_id,product_id,variant_id,title,sku,quantity,unit_price,total,snapshot
			) values(
				${randomUUID()}::uuid,${id}::uuid,${item.product_id}::uuid,${item.variant_id}::uuid,
				${`${item.product_name} · ${item.variant_title}`},${item.sku||null},${item.quantity},
				${item.unit_price},${item.total},
				${JSON.stringify({product_name:item.product_name,variant_title:item.variant_title})}::jsonb
			)
		`),
	];
	await sql.transaction(queries);
	res.status(201).json({
		checkout:{
			token,currency,subtotal,discount_total:discount,discount_code:discountCode,shipping_total:shipping,shipping_rate_id:shippingRateId,shipping_rate_name:shippingRateName,tax_total:tax,total,status:"open",
			items:normalized.map(item=>({
				variant_id:item.variant_id,
				title:`${item.product_name} · ${item.variant_title}`,
				quantity:item.quantity,
				unit_price:item.unit_price,
				total:item.total,
			})),
		},
	});
});
publicRouter.get("/recovery/:token",checkoutLimiter,requirePublicStore,async(req,res)=>{
 const rows=await sql`
  select c.id
  from checkout_sessions c
  where c.token=${req.params.token}::uuid
   and c.store_id=${req.publicStore.id}::uuid
   and c.completed_order_id is null
   and c.created_at>now()-interval '14 days'
  limit 1`;
 if(!rows.length)return res.status(404).json({error:"Carrito de recuperación no disponible"});
 const items=await sql`
  select v.id as variant_id,p.name as product_name,v.title as variant_title,
   coalesce(v.price,p.price)::numeric as price,ci.quantity
  from checkout_items ci
  join checkout_sessions c on c.id=ci.checkout_id
  join product_variants v on v.id=ci.variant_id and v.store_id=c.store_id
  join products p on p.id=v.product_id and p.store_id=c.store_id
  where c.id=${rows[0].id}::uuid and p.status='active' and v.active=true
  order by ci.id`;
 if(!items.length)return res.status(410).json({error:"Los artículos de este carrito ya no están disponibles"});
 res.json({items:items.map(x=>({variant_id:x.variant_id,title:x.product_name+(x.variant_title&&x.variant_title!=="Default"?" · "+x.variant_title:""),price:Number(x.price),quantity:Math.max(1,Math.min(99,Number(x.quantity)||1))}))});
});
publicRouter.post("/checkout/:token/payment",checkoutLimiter,async(req,res)=>{
 const rows=await sql`
  select c.id,c.store_id,c.status,c.currency,c.total,
   s.status as store_status,pa.provider,pa.status as account_status,
   pa.charges_enabled,pa.payouts_enabled,pa.provider_account_id
  from checkout_sessions c
  join stores s on s.id=c.store_id
  left join store_payment_accounts pa on pa.store_id=c.store_id
  where c.token=${req.params.token}::uuid and (c.expires_at>now() or c.status='completed')
  limit 1`;
 if(!rows.length)return res.status(404).json({error:"Checkout no encontrado o caducado"});
 const c=rows[0];
 // A retry of a completed free order must not create a second order or charge.
 if(c.status==="completed"){
  const prior=await sql`select o.id from checkout_sessions c
   join orders o on o.id=c.completed_order_id and o.store_id=c.store_id
   where c.id=${c.id}::uuid and o.payment_provider='free'
     and o.payment_status='paid' and o.total=0 limit 1`;
  if(prior.length){await enqueueOrderNotification({storeId:c.store_id,orderId:prior[0].id,type:"order.confirmed"});return res.json({provider:"free",status:"completed",order_id:prior[0].id})}
  return res.status(409).json({error:"Checkout ya pagado"});
 }
 const controls=await sql`select enabled from platform_controls where key='checkout' limit 1`;
 if(!checkoutControlEnabled(controls))return res.status(503).json({error:"Checkout temporalmente desactivado por la plataforma"});
 if(requiresCurrencyMinorUnitUpgrade(c.currency))return res.status(422).json({error:"Esta moneda aún no admite cobros seguros en BravoShop"});
 if(!isValidTwoDecimalStripeAmount(c.total))return res.status(422).json({error:"Importe no admitido por Stripe. Contacta con la tienda"});
 if(!meetsStripeMinimumCharge(Math.round(Number(c.total)*100),c.currency))return res.status(422).json({error:"Total inferior al mínimo de Stripe. Crea un carrito con otro importe"});
 const billingState=await sql`select bravoshop_refresh_store_billing(${c.store_id}::uuid) as status`;
 c.store_status=billingState[0]?.status||c.store_status;
 if(!await publicFeatureEnabled(c.store_id,"checkout"))
  return res.status(503).json({error:"La tienda ha desactivado temporalmente el checkout"});
 if(!["active","trial"].includes(c.store_status))
  return res.status(423).json({error:"Tienda no disponible"});
 if(!merchantStripeAccountReady({...c,status:c.account_status}))
  return res.status(503).json({error:"La cuenta Stripe ya no está habilitada para cobros y transferencias"});
 if(!process.env.STRIPE_SECRET_KEY)
  return res.status(503).json({error:"Proveedor de pagos pendiente de configuración"});
 await sql`select bravoshop_release_expired_inventory_reservations()`;
 const reservation=await sql`select bravoshop_reserve_checkout_inventory(${c.id}::uuid) as reserved`;
 if(!reservation[0]?.reserved)
  return res.status(409).json({error:"Stock insuficiente o checkout caducado"});

 // A truly zero-total order needs neither PaymentIntent nor Stripe.js. The database
 // function handles idempotency, tenant ownership, stock and order creation atomically.
 if(Number(c.total)===0){
  let result;
  try{
   result=await sql`select bravoshop_complete_free_checkout(${c.id}::uuid,${c.store_id}::uuid) as order_id`;
  }catch(error){
   if(error.code==="P0001")return res.status(409).json({error:"No se pudo reservar el stock del pedido gratuito"});
   throw error;
  }
  const orderId=result[0]?.order_id;
  if(!orderId)return res.status(409).json({error:"El pedido ha cambiado; comprueba su estado"});
  await enqueueOrderNotification({storeId:c.store_id,orderId,type:"order.confirmed"});
  return res.json({provider:"free",status:"completed",order_id:orderId});
 }

 const claim=await sql`select bravoshop_claim_checkout_payment(${c.id}::uuid) as claimed`;
 if(!claim[0]?.claimed)
  return res.status(409).json({error:"El pago ya se está preparando; inténtalo de nuevo en unos segundos"});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
 let intent;
 try{
  intent=await stripe.paymentIntents.create({
   amount:Math.round(Number(c.total)*100),
   currency:String(c.currency).toLowerCase(),
   automatic_payment_methods:{enabled:true},
   metadata:{bravoshop_checkout_id:String(c.id),bravoshop_store_id:String(c.store_id)}
  },{stripeAccount:c.provider_account_id,idempotencyKey:"bravoshop-checkout-"+c.id});
  const finished=await sql`select bravoshop_finish_checkout_payment_claim(${c.id}::uuid,${intent.id}) as finished`;
  if(!finished[0]?.finished)return res.status(409).json({error:"El checkout cambió mientras se preparaba el pago"});
 }catch(error){
  await sql`select bravoshop_release_checkout_payment_claim(${c.id}::uuid)`;
  throw error;
 }
 res.json({provider:"stripe",client_secret:intent.client_secret,status:intent.status});
});

publicRouter.get("/checkout/:token",checkoutLimiter,async(req,res)=>{
	const rows=await sql`
		select c.status,c.currency,c.subtotal,c.shipping_total,c.shipping_rate_id,c.shipping_rate_name,c.tax_total,c.discount_total,c.total,c.expires_at,
			s.name as store_name,s.slug as store_slug,o.order_number,o.fulfillment_status,o.payment_status,o.payment_provider,
			o.shipping_method,o.tracking_number,o.tracking_url,o.carrier,o.shipped_at,o.delivered_at
		from checkout_sessions c
		join stores s on s.id=c.store_id
		left join orders o on o.id=c.completed_order_id and o.store_id=c.store_id
		where c.token=${req.params.token}::uuid and (c.expires_at>now() or c.status='completed')
		limit 1
	`;
	if(!rows.length)return res.status(404).json({error:"Checkout no encontrado o caducado"});
	const items=await sql`
		select ci.title,ci.quantity,ci.unit_price,ci.total
		from checkout_items ci
		join checkout_sessions c on c.id=ci.checkout_id
		where c.token=${req.params.token}::uuid and (c.expires_at>now() or c.status='completed')
		order by ci.id
	`;
	res.json({checkout:{...rows[0],items}});
});
