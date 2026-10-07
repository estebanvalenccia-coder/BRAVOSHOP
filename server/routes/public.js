import{Router}from"express";import{randomUUID}from"node:crypto";import{domainToASCII}from"node:url";import{isIP}from"node:net";import{sql}from"../db/neon.js";import Stripe from"stripe";import{checkoutLimiter}from"../middleware/rateLimit.js";
export const publicRouter=Router();
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
	if(req.body.email!==undefined&&(typeof req.body.email!=="string"||req.body.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)))return res.status(400).json({error:"Email no válido"});
	if(req.body.currency!==undefined&&(typeof req.body.currency!=="string"||! /^[A-Za-z]{3}$/.test(req.body.currency)))return res.status(400).json({error:"Moneda no válida"});
	if(req.body.discount_code!==undefined&&(typeof req.body.discount_code!=="string"||req.body.discount_code.length>80))return res.status(400).json({error:"Código de descuento no válido"});
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
export function normalizePublicHost(value){
	if(typeof value!=="string"||value.length>300||/[\s/@?#\\]/.test(value))return null;
	let candidate=value.trim().toLowerCase();
	if(candidate.startsWith("http://")||candidate.startsWith("https://")){
		try{const url=new URL(candidate);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)return null;candidate=url.hostname.toLowerCase()}catch{return null}
	}else candidate=candidate.replace(/:\d{1,5}$/,"");
	candidate=candidate.replace(/\.$/,"");
	const ascii=domainToASCII(candidate);
	if(!ascii||ascii.length>253||isIP(ascii))return null;
	const labels=ascii.split(".");
	if(labels.some(label=>label.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))return null;
	return ascii;
}
async function resolveStore(hostInput){
	const host=normalizePublicHost(hostInput);if(!host)return null;
	if(host.endsWith(".bravoshop.online")){
		const labels=host.split(".");
		if(labels.length!==3||reservedSubdomains.has(labels[0]))return null;
		const rows=await sql`select s.*,ss.settings,st.theme from stores s left join store_settings ss on ss.store_id=s.id left join store_theme st on st.store_id=s.id where s.slug=${labels[0]} limit 1`;
		return rows[0]||null;
	}
	const rows=await sql`select s.*,ss.settings,st.theme from domains d join stores s on s.id=d.store_id left join store_settings ss on ss.store_id=s.id left join store_theme st on st.store_id=s.id where lower(d.hostname)=${host} and d.kind='custom' and d.status='verified' limit 1`;
	return rows[0]||null;
}
async function requirePublicStore(req,res,next){
	if(req.method==="POST"&&req.path==="/checkout")await sql`select bravoshop_release_expired_inventory_reservations()`;
	const requestedHost=req.query.host||req.body?.host;
	const originHost=(()=>{try{return req.get("origin")?new URL(req.get("origin")).hostname:null}catch{return null}})();
	const requestHost=req.get("host");
	const candidates=[requestedHost,originHost,requestHost].filter(Boolean);
	let store=null;
	for(const candidate of candidates){store=await resolveStore(candidate);if(store)break}
	if(!store)return res.status(404).json({error:"Tienda no encontrada"});
	if(!["active","trial"].includes(store.status))return res.status(423).json({error:"Tienda no disponible"});
	req.publicStore=store;
	next();
}
publicRouter.get("/store",requirePublicStore,async(req,res)=>{const features=await sql`select feature_key,enabled from store_features where store_id=${req.publicStore.id}::uuid and enabled=true`;res.json({store:{name:req.publicStore.name,slug:req.publicStore.slug,sector:req.publicStore.sector,theme:req.publicStore.theme||{},settings:publicSettings(req.publicStore.settings||{}),features}})});
publicRouter.get("/payment-config",requirePublicStore,async(req,res)=>{const rows=await sql`select provider,provider_account_id,charges_enabled from store_payment_accounts where store_id=${req.publicStore.id}::uuid limit 1`;const p=rows[0];if(!p||p.provider!=="stripe"||!p.provider_account_id||!p.charges_enabled)return res.status(503).json({error:"La tienda todavía no tiene pagos habilitados"});const publishableKey=process.env.STRIPE_PUBLISHABLE_KEY;if(!publishableKey||!publishableKey.startsWith("pk_"))return res.status(503).json({error:"Stripe público pendiente de configuración"});res.json({provider:"stripe",publishable_key:publishableKey,account_id:p.provider_account_id})});
publicRouter.get("/products",requirePublicStore,async(req,res)=>{const rows=await sql`select p.id,p.name,p.slug,p.description,p.price,p.product_type,p.vendor,p.created_at,p.published_at,(select m.public_url from product_media pm join media_assets m on m.id=pm.media_id where pm.product_id=p.id and pm.store_id=p.store_id and m.store_id=p.store_id and m.visibility='public' order by pm.is_primary desc,pm.position limit 1) as image_url,coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug) order by c.position,c.name) from product_categories pc join categories c on c.id=pc.category_id and c.store_id=p.store_id where pc.product_id=p.id and pc.store_id=p.store_id and c.active=true),'[]'::jsonb) as categories from products p where p.store_id=${req.publicStore.id}::uuid and p.status='active' order by p.published_at desc nulls last,p.created_at desc limit 200`;res.json({products:rows})});
publicRouter.get("/categories",requirePublicStore,async(req,res)=>{const rows=await sql`select c.id,c.name,c.slug,c.description,c.position,count(pc.product_id) filter(where p.status='active')::int as product_count from categories c left join product_categories pc on pc.category_id=c.id and pc.store_id=c.store_id left join products p on p.id=pc.product_id and p.store_id=c.store_id where c.store_id=${req.publicStore.id}::uuid and c.active=true group by c.id order by c.position,c.name`;res.json({categories:rows})});
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
	if(controls.length&&!controls[0].enabled)return res.status(503).json({error:"Checkout temporalmente desactivado"});
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
		const lineTotalCents=unitPriceCents*item.quantity;
		if(!Number.isSafeInteger(lineTotalCents)||!Number.isSafeInteger(subtotalCents+lineTotalCents))return res.status(400).json({error:"Importe del carrito no válido"});
		subtotalCents+=lineTotalCents;
		normalized.push({...product,quantity:item.quantity,unit_price:unitPriceCents/100,total:lineTotalCents/100});
	}

	const payment=await sql`select default_currency from store_payment_accounts where store_id=${req.publicStore.id}::uuid limit 1`;
	const currency=String(payment[0]?.default_currency||req.publicStore.settings?.currency||"EUR").toUpperCase();
	if(req.body.currency&&req.body.currency.toUpperCase()!==currency)return res.status(400).json({error:"Moneda no válida para esta tienda"});
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
	if(!Number.isSafeInteger(totalCents))return res.status(400).json({error:"Importe del carrito no válido"});
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
				id,store_id,token,status,currency,subtotal,discount_total,discount_code,shipping_total,shipping_rate_id,shipping_rate_name,tax_total,total,customer_email,shipping_address
			) values(
				${id}::uuid,${req.publicStore.id}::uuid,${token}::uuid,'open',${currency},
				${subtotal},${discount},${discountCode},${shipping},${shippingRateId}::uuid,${shippingRateName},${tax},${total},${req.body.email||null},${addressJson}::jsonb
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
publicRouter.post("/checkout/:token/payment",checkoutLimiter,async(req,res)=>{const rows=await sql`select c.id,c.store_id,c.status,c.currency,c.total,s.status as store_status,pa.provider,pa.status as account_status,pa.charges_enabled,pa.provider_account_id from checkout_sessions c join stores s on s.id=c.store_id left join store_payment_accounts pa on pa.store_id=c.store_id where c.token=${req.params.token}::uuid and c.expires_at>now() limit 1`;if(!rows.length)return res.status(404).json({error:"Checkout no encontrado o caducado"});const c=rows[0];if(!await publicFeatureEnabled(c.store_id,"checkout"))return res.status(503).json({error:"La tienda ha desactivado temporalmente el checkout"});if(c.status==="completed")return res.status(409).json({error:"Checkout ya pagado"});if(!["active","trial"].includes(c.store_status))return res.status(423).json({error:"Tienda no disponible"});if(c.provider!=="stripe"||!c.provider_account_id||!c.charges_enabled)return res.status(503).json({error:"La tienda todavía no tiene pagos reales habilitados"});if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Proveedor de pagos pendiente de configuración"});await sql`select bravoshop_release_expired_inventory_reservations()`;const reservation=await sql`select bravoshop_reserve_checkout_inventory(${c.id}::uuid) as reserved`;if(!reservation[0]?.reserved)return res.status(409).json({error:"Stock insuficiente o checkout caducado"});const claim=await sql`select bravoshop_claim_checkout_payment(${c.id}::uuid) as claimed`;if(!claim[0]?.claimed)return res.status(409).json({error:"El pago ya se está preparando; inténtalo de nuevo en unos segundos"});const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);let intent;try{intent=await stripe.paymentIntents.create({amount:Math.round(Number(c.total)*100),currency:String(c.currency).toLowerCase(),automatic_payment_methods:{enabled:true},metadata:{bravoshop_checkout_id:String(c.id),bravoshop_store_id:String(c.store_id)}},{stripeAccount:c.provider_account_id,idempotencyKey:"bravoshop-checkout-"+c.id});const finished=await sql`select bravoshop_finish_checkout_payment_claim(${c.id}::uuid,${intent.id}) as finished`;if(!finished[0]?.finished)return res.status(409).json({error:"El checkout cambió mientras se preparaba el pago"})}catch(error){await sql`select bravoshop_release_checkout_payment_claim(${c.id}::uuid)`;throw error}res.json({provider:"stripe",client_secret:intent.client_secret,status:intent.status})});
publicRouter.get("/checkout/:token",checkoutLimiter,async(req,res)=>{
	const rows=await sql`
		select c.status,c.currency,c.subtotal,c.shipping_total,c.shipping_rate_id,c.shipping_rate_name,c.tax_total,c.discount_total,c.total,c.expires_at,
			s.name as store_name,s.slug as store_slug
		from checkout_sessions c
		join stores s on s.id=c.store_id
		where c.token=${req.params.token}::uuid and c.expires_at>now()
		limit 1
	`;
	if(!rows.length)return res.status(404).json({error:"Checkout no encontrado o caducado"});
	const items=await sql`
		select title,quantity,unit_price,total
		from checkout_items
		where checkout_id=(
			select id from checkout_sessions where token=${req.params.token}::uuid and expires_at>now()
		)
		order by id
	`;
	res.json({checkout:{...rows[0],items}});
});
