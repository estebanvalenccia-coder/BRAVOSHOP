import{Router}from"express";import{randomUUID}from"node:crypto";import{sql}from"../db/neon.js";import Stripe from"stripe";import{requireAuth,requireStore}from"../middleware/auth.js";import{requirePermission}from"../middleware/permissions.js";import{enqueueOrderNotification}from"../services/notifications.js";
export const commerceRouter=Router({mergeParams:true});commerceRouter.use(requireAuth,requireStore);
const SLUG_PATTERN=/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

commerceRouter.get("/products",requirePermission("products.read"),async(req,res)=>{const rows=await sql`select * from products where store_id=${req.storeId}::uuid order by created_at desc`;res.json({products:rows})});
commerceRouter.get("/products/:id",requirePermission("products.read"),async(req,res)=>{const rows=await sql`select * from products where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid limit 1`;if(!rows.length)return res.status(404).json({error:"Producto no encontrado"});const variants=await sql`select v.*,i.quantity,i.reserved,i.track_inventory,i.allow_backorder from product_variants v left join inventory_levels i on i.variant_id=v.id where v.product_id=${req.params.id}::uuid and v.store_id=${req.storeId}::uuid order by v.created_at`;const media=await sql`select m.*,pm.position,pm.is_primary from product_media pm join media_assets m on m.id=pm.media_id and m.store_id=${req.storeId}::uuid where pm.product_id=${req.params.id}::uuid and pm.store_id=${req.storeId}::uuid order by pm.position`;const categories=await sql`select pc.category_id from product_categories pc join categories c on c.id=pc.category_id and c.store_id=pc.store_id where pc.product_id=${req.params.id}::uuid and pc.store_id=${req.storeId}::uuid`;res.json({product:{...rows[0],variants,media,categories:categories.map(x=>x.category_id)}})});
commerceRouter.post("/products",requirePermission("products.create"),async(req,res)=>{
	const p=req.body||{};
	const name=typeof p.name==="string"?p.name.trim():"";
	const slug=typeof p.slug==="string"?p.slug.trim().toLowerCase():"";
	const price=Number(p.price??0);const status=["draft","active","archived"].includes(p.status)?p.status:"draft";
	if(!name||name.length>180||!SLUG_PATTERN.test(slug))return res.status(400).json({error:"Nombre o slug no válido"});
	if(!Number.isFinite(price)||price<0)return res.status(400).json({error:"Precio no válido"});
	const id=randomUUID(),variantId=randomUUID();
	const queries=[
		sql`insert into products(id,store_id,name,slug,description,price,status,product_type,vendor,metadata,seo,published_at) values(${id}::uuid,${req.storeId}::uuid,${name},${slug},${String(p.description||"").slice(0,10000)},${price},${status},${p.product_type||null},${p.vendor||null},${JSON.stringify(p.metadata||{})}::jsonb,${JSON.stringify(p.seo||{})}::jsonb,case when ${status}='active' then now() else null end)`,
		sql`insert into product_variants(id,store_id,product_id,title,price,active) values(${variantId}::uuid,${req.storeId}::uuid,${id}::uuid,'Default',null,true)`,
		sql`insert into inventory_levels(variant_id,quantity,reserved,track_inventory,allow_backorder) values(${variantId}::uuid,0,0,false,false)`,
	];
	await sql.transaction(queries);
	const rows=await sql`select * from products where id=${id}::uuid and store_id=${req.storeId}::uuid`;
	res.status(201).json({product:rows[0],variant:{id:variantId,store_id:req.storeId,product_id:id,title:"Default",price:null,active:true,quantity:0,reserved:0,track_inventory:false,allow_backorder:false}});
});
commerceRouter.put("/products/:id",requirePermission("products.update"),async(req,res)=>{
	const p=req.body||{};
	const name=typeof p.name==="string"?p.name.trim():"";
	const slug=typeof p.slug==="string"?p.slug.trim().toLowerCase():"";
	const price=Number(p.price??0);const status=["draft","active","archived"].includes(p.status)?p.status:"draft";
	if(!name||name.length>180||!SLUG_PATTERN.test(slug))return res.status(400).json({error:"Nombre o slug no válido"});
	if(!Number.isFinite(price)||price<0)return res.status(400).json({error:"Precio no válido"});
	const rows=await sql`
		update products
		set name=${name},slug=${slug},description=${String(p.description||"").slice(0,10000)},
			price=${price},status=${status},published_at=case when ${status}='active' then coalesce(published_at,now()) else published_at end,product_type=${p.product_type||null},vendor=${p.vendor||null},
			metadata=${JSON.stringify(p.metadata||{})}::jsonb,seo=${JSON.stringify(p.seo||{})}::jsonb,updated_at=now()
		where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid
		returning *
	`;
	if(!rows.length)return res.status(404).json({error:"Producto no encontrado"});
	if(rows[0].status==="active"){
		await sql`
			update media_assets m
			set visibility='public'
			where m.store_id=${req.storeId}::uuid
				and exists(select 1 from product_media pm where pm.product_id=${rows[0].id} and pm.media_id=m.id and pm.store_id=${req.storeId}::uuid)
		`;
	}
	res.json({product:rows[0]});
});

commerceRouter.post("/products/:id/variants",requirePermission("products.update"),async(req,res)=>{const exists=await sql`select 1 from products where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid`;if(!exists.length)return res.status(404).json({error:"Producto no encontrado"});const v=req.body||{};const rows=await sql`insert into product_variants(id,store_id,product_id,sku,title,price,compare_at_price,options,active) values(${randomUUID()}::uuid,${req.storeId}::uuid,${req.params.id}::uuid,${v.sku||null},${v.title||"Default"},${v.price===""?null:Number(v.price)},${v.compare_at_price?Number(v.compare_at_price):null},${JSON.stringify(v.options||{})}::jsonb,${v.active!==false}) returning *`;res.status(201).json({variant:rows[0]})});
commerceRouter.put("/products/:productId/variants/:variantId",requirePermission("products.update"),async(req,res)=>{const v=req.body||{};const rows=await sql`update product_variants pv set sku=${v.sku||null},title=${v.title||"Default"},price=${v.price===""?null:Number(v.price)},compare_at_price=${v.compare_at_price?Number(v.compare_at_price):null},options=${JSON.stringify(v.options||{})}::jsonb,active=${v.active!==false} from products p where pv.id=${req.params.variantId}::uuid and pv.product_id=${req.params.productId}::uuid and p.id=pv.product_id and pv.store_id=${req.storeId}::uuid and p.store_id=${req.storeId}::uuid returning pv.*`;if(!rows.length)return res.status(404).json({error:"Variante no encontrada"});res.json({variant:rows[0]})});
commerceRouter.delete("/products/:id",requirePermission("products.delete"),async(req,res)=>{
 const exists=await sql`select id from products where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid limit 1`;
 if(!exists.length)return res.status(404).json({error:"Producto no encontrado"});
 const used=await sql`select 1 from order_items oi join orders o on o.id=oi.order_id where oi.product_id=${req.params.id}::uuid and o.store_id=${req.storeId}::uuid limit 1`;
 if(used.length){
  const rows=await sql`update products set status='archived',updated_at=now() where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning *`;
  return res.json({archived:true,product:rows[0]});
 }
 await sql`delete from products where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid`;
 res.status(204).end();
});
commerceRouter.delete("/products/:productId/variants/:variantId",requirePermission("products.delete"),async(req,res)=>{
 const rows=await sql`select pv.id,coalesce(i.reserved,0)::int as reserved from product_variants pv left join inventory_levels i on i.variant_id=pv.id where pv.id=${req.params.variantId}::uuid and pv.product_id=${req.params.productId}::uuid and pv.store_id=${req.storeId}::uuid limit 1`;
 if(!rows.length)return res.status(404).json({error:"Variante no encontrada"});
 const used=await sql`select 1 from order_items oi join orders o on o.id=oi.order_id where oi.variant_id=${req.params.variantId}::uuid and o.store_id=${req.storeId}::uuid limit 1`;
 if(used.length||rows[0].reserved>0){
  const updated=await sql`update product_variants set active=false where id=${req.params.variantId}::uuid and product_id=${req.params.productId}::uuid and store_id=${req.storeId}::uuid returning *`;
  return res.json({deactivated:true,variant:updated[0]});
 }
 await sql`delete from product_variants where id=${req.params.variantId}::uuid and product_id=${req.params.productId}::uuid and store_id=${req.storeId}::uuid`;
 res.status(204).end();
});
commerceRouter.put("/variants/:variantId/inventory",requirePermission("inventory.update"),async(req,res)=>{const i=req.body||{};const quantity=Number(i.quantity);if(!Number.isSafeInteger(quantity)||quantity<0)return res.status(400).json({error:"La cantidad debe ser un entero no negativo"});const rows=await sql`select * from bravoshop_set_inventory(${req.storeId}::uuid,${req.params.variantId}::uuid,${quantity},${i.track_inventory!==false},${Boolean(i.allow_backorder)},${req.user.id}::uuid)`;if(!rows.length){const owns=await sql`select 1 from product_variants v where v.id=${req.params.variantId}::uuid and v.store_id=${req.storeId}::uuid`;if(!owns.length)return res.status(404).json({error:"Variante no encontrada"});return res.status(409).json({error:"La cantidad no puede quedar por debajo del inventario reservado"})}res.json({inventory:rows[0]})});

commerceRouter.put("/products/:id/media",requirePermission("products.update"),async(req,res)=>{
	const supplied=req.body?.media_ids??[];
	if(!Array.isArray(supplied)||supplied.length>20)return res.status(400).json({error:"Lista de imágenes inválida"});
	const ids=[...new Set(supplied)];
	if(ids.some(id=>typeof id!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))return res.status(400).json({error:"Identificador de imagen inválido"});
	const owns=await sql`select 1 from products where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid`;
	if(!owns.length)return res.status(404).json({error:"Producto no encontrado"});
	if(ids.length){
		const valid=await sql`select id from media_assets where store_id=${req.storeId}::uuid and id=any(${ids}::uuid[])`;
		if(valid.length!==ids.length)return res.status(400).json({error:"Una o más imágenes no pertenecen a esta tienda"});
	}
	const queries=[
		sql`delete from product_media where product_id=${req.params.id}::uuid and store_id=${req.storeId}::uuid`,
		...ids.map((id,position)=>sql`
			insert into product_media(product_id,media_id,store_id,position,is_primary)
			values(${req.params.id}::uuid,${id}::uuid,${req.storeId}::uuid,${position},${position===0})
		`),
		sql`
			update media_assets m
			set visibility=case when exists(
				select 1 from product_media pm where pm.media_id=m.id and pm.store_id=${req.storeId}::uuid
			) then 'public' else 'private' end
			where m.store_id=${req.storeId}::uuid
		`,
	];
	await sql.transaction(queries);
	const media=await sql`
		select m.*,pm.position,pm.is_primary
		from product_media pm
		join media_assets m on m.id=pm.media_id and m.store_id=${req.storeId}::uuid
		where pm.product_id=${req.params.id}::uuid and pm.store_id=${req.storeId}::uuid
		order by pm.position
	`;
	res.json({media});
});

commerceRouter.get("/orders",requirePermission("orders.read"),async(req,res)=>{const rows=await sql`select o.*,c.name as customer_name,coalesce(c.phone,o.shipping_address->>'phone') as customer_phone from orders o left join customers c on c.id=o.customer_id and c.store_id=o.store_id where o.store_id=${req.storeId}::uuid order by o.created_at desc limit 200`;res.json({orders:rows})});
commerceRouter.get("/orders/:id",requirePermission("orders.read"),async(req,res)=>{
 const rows=await sql`select o.*,c.name as customer_name,coalesce(c.phone,o.shipping_address->>'phone') as customer_phone from orders o left join customers c on c.id=o.customer_id and c.store_id=o.store_id where o.id=${req.params.id}::uuid and o.store_id=${req.storeId}::uuid limit 1`;
 if(!rows.length)return res.status(404).json({error:"Pedido no encontrado"});
 const items=await sql`
  select oi.*,
   coalesce((
    select sum(ri.quantity)
    from order_refund_items ri
    join order_refunds r on r.id=ri.refund_id
    where ri.order_item_id=oi.id
      and r.store_id=${req.storeId}::uuid
      and r.status in ('processing','pending','succeeded')
   ),0)::int as refunded_quantity
  from order_items oi
  join orders o on o.id=oi.order_id and o.store_id=${req.storeId}::uuid
  where oi.order_id=${req.params.id}::uuid
  order by oi.id`;
 const events=await sql`
  select oe.event_type,oe.message,oe.metadata,oe.created_at
  from order_events oe
  join orders o on o.id=oe.order_id and o.store_id=oe.store_id
  where oe.order_id=${req.params.id}::uuid and oe.store_id=${req.storeId}::uuid
  order by oe.created_at desc`;
 const refunds=await sql`
  select r.id,r.amount,r.currency,r.status,r.reason,r.provider_refund_id,r.requested_at,r.processed_at,r.created_at,
   coalesce(json_agg(json_build_object('order_item_id',ri.order_item_id,'quantity',ri.quantity,'amount',ri.amount))
    filter(where ri.id is not null),'[]') as items
  from order_refunds r
  left join order_refund_items ri on ri.refund_id=r.id
  where r.order_id=${req.params.id}::uuid and r.store_id=${req.storeId}::uuid
  group by r.id
  order by r.created_at desc`;
 res.json({order:{...rows[0],items,events,refunds}});
});
commerceRouter.patch("/orders/:id/fulfillment",requirePermission("orders.fulfill"),async(req,res)=>{const p=req.body||{};const allowed=new Set(["unfulfilled","preparing","fulfilled","delivered","cancelled"]);if(!allowed.has(p.fulfillment_status))return res.status(400).json({error:"Estado logístico no válido"});const rows=await sql`update orders set fulfillment_status=${p.fulfillment_status},tracking_number=coalesce(${p.tracking_number||null},tracking_number),tracking_url=coalesce(${p.tracking_url||null},tracking_url),carrier=coalesce(${p.carrier||null},carrier),merchant_notes=coalesce(${p.merchant_notes||null},merchant_notes),shipped_at=case when ${p.fulfillment_status}='fulfilled' then coalesce(shipped_at,now()) else shipped_at end,delivered_at=case when ${p.fulfillment_status}='delivered' then coalesce(delivered_at,now()) else delivered_at end,cancelled_at=case when ${p.fulfillment_status}='cancelled' then coalesce(cancelled_at,now()) else cancelled_at end,updated_at=now() where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning *`;if(!rows.length)return res.status(404).json({error:"Pedido no encontrado"});await sql`insert into order_events(order_id,store_id,event_type,message,actor_user_id,metadata) select o.id,o.store_id,'fulfillment.updated',${p.fulfillment_status},${req.user.id}::uuid,${JSON.stringify({carrier:p.carrier||null,tracking_number:p.tracking_number||null})}::jsonb from orders o where o.id=${req.params.id}::uuid and o.store_id=${req.storeId}::uuid`;if(p.fulfillment_status==="fulfilled"||p.fulfillment_status==="delivered")await enqueueOrderNotification({storeId:req.storeId,orderId:rows[0].id,type:p.fulfillment_status==="fulfilled"?"order.shipped":"order.delivered"});res.json({order:rows[0]})});
commerceRouter.post("/orders/:id/refunds",requirePermission("orders.refund"),async(req,res)=>{
	const rows=await sql`
		select o.id,o.store_id,o.subtotal,o.discount_total,o.tax_total,o.total,o.refunded_total,o.refund_reserved_total,o.currency,
			o.payment_status,o.payment_provider,o.provider_payment_id,pa.provider_account_id
		from orders o
		left join store_payment_accounts pa on pa.store_id=o.store_id and pa.provider='stripe'
		where o.id=${req.params.id}::uuid and o.store_id=${req.storeId}::uuid
		limit 1
	`;
	if(!rows.length)return res.status(404).json({error:"Pedido no encontrado"});
	const order=rows[0];
	if(!["paid","partially_refunded"].includes(order.payment_status)||order.payment_provider!=="stripe"||!order.provider_payment_id)return res.status(409).json({error:"El pedido no tiene un pago Stripe reembolsable"});
	if(!order.provider_account_id)return res.status(409).json({error:"La cuenta Stripe de la tienda no está conectada"});
	if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:"Stripe no está configurado"});

	const remainingCents=Math.round(Number(order.total)*100)
		-Math.round(Number(order.refunded_total||0)*100)
		-Math.round(Number(order.refund_reserved_total||0)*100);
	const requestedItems=Array.isArray(req.body?.items)?req.body.items:[];
	let itemAmountCents=null;
	if(requestedItems.length){
		if(requestedItems.length>100)return res.status(400).json({error:"Demasiadas líneas de reembolso"});
		const seen=new Set();itemAmountCents=0;
		for(const requested of requestedItems){
			const itemId=String(requested?.order_item_id||"");
			const quantity=Number(requested?.quantity);
			if(!/^[0-9a-f-]{36}$/i.test(itemId)||!Number.isSafeInteger(quantity)||quantity<=0||seen.has(itemId))return res.status(400).json({error:"Líneas de reembolso inválidas"});
			seen.add(itemId);
			const line=await sql`select oi.id,oi.quantity,oi.unit_price,coalesce((select sum(ri.quantity) from order_refund_items ri join order_refunds rr on rr.id=ri.refund_id where ri.order_item_id=oi.id and rr.store_id=${req.storeId}::uuid and rr.status in ('processing','pending','succeeded')),0)::int as already_refunded from order_items oi join orders o on o.id=oi.order_id where oi.id=${itemId}::uuid and oi.order_id=${order.id}::uuid and o.store_id=${req.storeId}::uuid limit 1`;
			if(!line.length||quantity>line[0].quantity-line[0].already_refunded)return res.status(409).json({error:"Cantidad de artículo no reembolsable"});
			const subtotal=Number(order.subtotal||0),discount=Number(order.discount_total||0),tax=Number(order.tax_total||0);
			const discountFactor=subtotal>0?Math.max(0,(subtotal-discount)/subtotal):1;
			const taxableAfterDiscount=Math.max(0,subtotal-discount);
			const taxFactor=taxableAfterDiscount>0&&tax>0?1+(tax/taxableAfterDiscount):1;
			itemAmountCents+=Math.round(Number(line[0].unit_price)*quantity*discountFactor*taxFactor*100);
		}
	}
	let amountCents=itemAmountCents??(req.body?.amount==null?remainingCents:Math.round(Number(req.body.amount)*100));
	if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>remainingCents)return res.status(400).json({error:"Importe de reembolso inválido o ya reservado"});
	let amount=amountCents/100;
	const reason=String(req.body?.reason||"").trim().slice(0,500)||null;
	let refundId;
	if(requestedItems.length){
		const createdRefund=await sql`select * from bravoshop_create_item_refund(${order.id}::uuid,${req.storeId}::uuid,${JSON.stringify(requestedItems)}::jsonb,${reason},${req.user.id}::uuid)`;
		refundId=createdRefund[0]?.refund_id;
		if(!refundId)return res.status(409).json({error:"Las cantidades o el importe reembolsable cambiaron; vuelve a consultar el pedido"});
		amountCents=Math.round(Number(createdRefund[0].amount)*100);
		if(!Number.isSafeInteger(amountCents)||amountCents<=0)return res.status(409).json({error:"La base de datos devolvió un importe de reembolso no válido"});
		amount=amountCents/100;
	}else{
		const reserved=await sql`select bravoshop_create_refund(${order.id}::uuid,${req.storeId}::uuid,${amount},${reason},${req.user.id}::uuid) as refund_id`;
		refundId=reserved[0]?.refund_id;
		if(!refundId)return res.status(409).json({error:"El importe disponible cambió; vuelve a consultar el pedido"});
	}
	const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
	let providerRefund;
	try{
		providerRefund=await stripe.refunds.create(
			{
				payment_intent:order.provider_payment_id,
				amount:amountCents,
				metadata:{bravoshop_refund_id:refundId,bravoshop_store_id:req.storeId},
			},
			{
				stripeAccount:order.provider_account_id,
				idempotencyKey:"bravoshop-refund-"+refundId,
			},
		);
	}catch(error){
		const outcomeUnknown=error.statusCode>=500
			||["StripeConnectionError","StripeAPIError","StripeRateLimitError"].includes(error.type);
		if(!outcomeUnknown){
			await sql`select bravoshop_update_refund_for_store(${refundId}::uuid,${req.storeId}::uuid,null,'failed')`;
		}
		console.error(JSON.stringify({
			level:"error",
			request_id:req.requestId,
			store_id:req.storeId,
			resource_id:order.id,
			error_code:error.type||"STRIPE_REFUND_FAILED",
		}));
		return res.status(502).json({error:"Stripe no pudo confirmar el reembolso",request_id:req.requestId});
	}

	const status=providerRefund.status==="succeeded"
		?"succeeded"
		:providerRefund.status==="failed"||providerRefund.status==="canceled"
			?"failed"
			:"pending";
	await sql`select bravoshop_update_refund_for_store(${refundId}::uuid,${req.storeId}::uuid,${providerRefund.id},${status})`;if(status==="succeeded"){await sql`select bravoshop_restock_refunded_order(${refundId}::uuid,${req.storeId}::uuid)`;await enqueueOrderNotification({storeId:req.storeId,orderId:order.id,type:"refund.succeeded",refundId,refundAmount:amount})};
	const refund=await sql`select r.* from order_refunds r join orders o on o.id=r.order_id and o.store_id=${req.storeId}::uuid where r.id=${refundId}::uuid and r.order_id=${order.id}::uuid`;
	res.status(201).json({refund:refund[0]});
});
commerceRouter.get("/customers",requirePermission("customers.read"),async(req,res)=>{const rows=await sql`select c.*,count(o.id)::int as order_count,coalesce(sum(case when o.payment_status in ('paid','partially_refunded') then o.total else 0 end),0)::numeric as lifetime_value,max(o.created_at) as last_order_at from customers c left join orders o on o.store_id=c.store_id and lower(o.customer_email)=lower(c.email) where c.store_id=${req.storeId}::uuid group by c.id order by last_order_at desc nulls last,c.created_at desc limit 500`;res.json({customers:rows})});
commerceRouter.get("/customers/:id",requirePermission("customers.read"),async(req,res)=>{const rows=await sql`select * from customers where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid limit 1`;if(!rows.length)return res.status(404).json({error:"Cliente no encontrado"});const orders=await sql`select id,total,currency,payment_status,fulfillment_status,created_at from orders where store_id=${req.storeId}::uuid and lower(customer_email)=lower(${rows[0].email||""}) order by created_at desc limit 100`;res.json({customer:{...rows[0],orders}})});
commerceRouter.patch("/customers/:id",requirePermission("customers.update"),async(req,res)=>{const p=req.body||{};const rows=await sql`update customers set name=coalesce(${p.name??null},name),phone=coalesce(${p.phone??null},phone),notes=coalesce(${p.notes??null},notes),updated_at=now() where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning *`;if(!rows.length)return res.status(404).json({error:"Cliente no encontrado"});res.json({customer:rows[0]})});

commerceRouter.get("/abandoned-checkouts",requirePermission("marketing.read"),async(req,res)=>{
 const limit=Math.min(100,Math.max(1,Number.parseInt(String(req.query.limit||"50"),10)||50));
 const rows=await sql`
  select id,customer_email,total,currency,status,expires_at,recovery_notified_at,created_at
  from checkout_sessions
  where store_id=${req.storeId}::uuid
   and completed_order_id is null
   and recovery_consent=true
   and created_at>=now()-interval '30 days'
  order by created_at desc
  limit ${limit}`;
 res.json({checkouts:rows});
});
const normalizeCampaignUrl=value=>{
 const raw=String(value||"").trim();
 if(!raw)return null;
 if(raw.startsWith("/")&&!raw.startsWith("//"))return raw.slice(0,1000);
 try{const u=new URL(raw);return u.protocol==="https:"?u.href.slice(0,1000):null}catch{return null}
};
commerceRouter.get("/campaigns",requirePermission("marketing.read"),async(req,res)=>{
 const rows=await sql`
  select id,name,subject,heading,body_text,button_label,button_url,status,recipient_count,sent_count,failed_count,queued_at,completed_at,created_at,updated_at
  from marketing_campaigns
  where store_id=${req.storeId}::uuid
  order by created_at desc limit 100`;
 res.json({campaigns:rows});
});
commerceRouter.post("/campaigns",requirePermission("marketing.manage"),async(req,res)=>{
 const p=req.body||{},name=String(p.name||"").trim().slice(0,120),subject=String(p.subject||"").trim().slice(0,160),heading=String(p.heading||"").trim().slice(0,160),body=String(p.body_text||"").trim().slice(0,5000),buttonLabel=String(p.button_label||"").trim().slice(0,80),buttonUrl=normalizeCampaignUrl(p.button_url);
 if(!name||!subject||!heading||!body||p.button_url&&!buttonUrl)return res.status(400).json({error:"Completa una campaña válida; los enlaces deben ser HTTPS o relativos"});
 const rows=await sql`
  insert into marketing_campaigns(store_id,name,subject,heading,body_text,button_label,button_url,created_by)
  values(${req.storeId}::uuid,${name},${subject},${heading},${body},${buttonLabel||null},${buttonUrl},${req.user.id}::uuid)
  returning *`;
 res.status(201).json({campaign:rows[0]});
});
commerceRouter.delete("/campaigns/:id",requirePermission("marketing.manage"),async(req,res)=>{
 const rows=await sql`delete from marketing_campaigns where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid and status='draft' returning id`;
 if(!rows.length)return res.status(409).json({error:"Solo se pueden eliminar campañas en borrador"});
 res.status(204).end();
});
commerceRouter.post("/campaigns/:id/send",requirePermission("marketing.manage"),async(req,res)=>{
 if(!process.env.RESEND_API_KEY||!process.env.BRAVOSHOP_EMAIL_FROM)return res.status(503).json({error:"El proveedor de email todavía no está configurado"});
 const exists=await sql`select id from marketing_campaigns where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid and status='draft' limit 1`;
 if(!exists.length)return res.status(409).json({error:"La campaña ya fue enviada o no está disponible"});
 const queued=await sql`select bravoshop_queue_marketing_campaign(${req.params.id}::uuid,${req.storeId}::uuid) as n`;
 if(!queued[0]?.n)return res.status(409).json({error:"No hay suscriptores activos para esta campaña"});
 res.json({ok:true,queued:Number(queued[0].n)});
});

commerceRouter.get("/newsletter",requirePermission("marketing.read"),async(req,res)=>{
 const limit=Math.min(250,Math.max(1,Number.parseInt(String(req.query.limit||"100"),10)||100));
 const status=String(req.query.status||"").trim();
 const rows=status&&["active","unsubscribed"].includes(status)
  ?await sql`select id,email,status,consent_at,unsubscribed_at,source,created_at,updated_at from newsletter_subscribers where store_id=${req.storeId}::uuid and status=${status} order by created_at desc limit ${limit}`
  :await sql`select id,email,status,consent_at,unsubscribed_at,source,created_at,updated_at from newsletter_subscribers where store_id=${req.storeId}::uuid order by created_at desc limit ${limit}`;
 res.json({subscribers:rows});
});
commerceRouter.post("/newsletter/:id/unsubscribe",requirePermission("marketing.manage"),async(req,res)=>{
 const id=String(req.params.id||"");
 if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(404).json({error:"Suscriptor no encontrado"});
 const rows=await sql`
  update newsletter_subscribers
  set status='unsubscribed',unsubscribed_at=coalesce(unsubscribed_at,now()),updated_at=now()
  where id=${id}::uuid and store_id=${req.storeId}::uuid
  returning id,email,status,unsubscribed_at`;
 if(!rows.length)return res.status(404).json({error:"Suscriptor no encontrado"});
 res.json({subscriber:rows[0]});
});
commerceRouter.get("/discounts",requirePermission("products.read"),async(req,res)=>{
 const rows=await sql`select * from discount_codes where store_id=${req.storeId}::uuid order by created_at desc`;
 res.json({discounts:rows});
});
commerceRouter.post("/discounts",requirePermission("products.update"),async(req,res)=>{
 const p=req.body||{},code=String(p.code||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,40),kind=p.kind==="fixed"?"fixed":"percent";
 const value=Number(p.value),minimum=Number(p.minimum_amount||0),usage=p.usage_limit==null||p.usage_limit===""?null:Number(p.usage_limit),starts=p.starts_at||null,ends=p.ends_at||null;
 if(!code||!Number.isFinite(value)||value<=0||(kind==="percent"&&value>100)||!Number.isFinite(minimum)||minimum<0||usage!==null&&(!Number.isInteger(usage)||usage<1)||starts&&Number.isNaN(Date.parse(starts))||ends&&Number.isNaN(Date.parse(ends))||starts&&ends&&Date.parse(ends)<=Date.parse(starts))return res.status(400).json({error:"Descuento no válido"});
 try{const rows=await sql`insert into discount_codes(store_id,code,kind,value,minimum_amount,active,starts_at,ends_at,usage_limit) values(${req.storeId}::uuid,${code},${kind},${value},${minimum},${p.active!==false},${starts},${ends},${usage}) returning *`;res.status(201).json({discount:rows[0]})}
 catch(e){if(e.code==="23505")return res.status(409).json({error:"Ese código ya existe"});throw e}
});
commerceRouter.patch("/discounts/:id",requirePermission("products.update"),async(req,res)=>{
 const p=req.body||{};const current=await sql`select * from discount_codes where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid limit 1`;
 if(!current.length)return res.status(404).json({error:"Descuento no encontrado"});
 const old=current[0],code=p.code===undefined?old.code:String(p.code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,40),kind=p.kind===undefined?old.kind:String(p.kind);
 const value=p.value===undefined?Number(old.value):Number(p.value),minimum=p.minimum_amount===undefined?Number(old.minimum_amount):Number(p.minimum_amount);
 const usage=p.usage_limit===undefined?old.usage_limit:(p.usage_limit==null||p.usage_limit===""?null:Number(p.usage_limit));
 const starts=p.starts_at===undefined?old.starts_at:(p.starts_at||null),ends=p.ends_at===undefined?old.ends_at:(p.ends_at||null),active=typeof p.active==="boolean"?p.active:Boolean(old.active);
 if(!code||!["percent","fixed"].includes(kind)||!Number.isFinite(value)||value<=0||(kind==="percent"&&value>100)||!Number.isFinite(minimum)||minimum<0||usage!==null&&(!Number.isInteger(Number(usage))||Number(usage)<1)||starts&&Number.isNaN(Date.parse(starts))||ends&&Number.isNaN(Date.parse(ends))||starts&&ends&&Date.parse(ends)<=Date.parse(starts))return res.status(400).json({error:"Descuento no válido"});
 try{const rows=await sql`update discount_codes set code=${code},kind=${kind},value=${value},minimum_amount=${minimum},usage_limit=${usage},starts_at=${starts},ends_at=${ends},active=${active},updated_at=now() where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning *`;res.json({discount:rows[0]})}
 catch(e){if(e.code==="23505")return res.status(409).json({error:"Ese código ya existe"});throw e}
});
commerceRouter.delete("/discounts/:id",requirePermission("products.update"),async(req,res)=>{const rows=await sql`delete from discount_codes where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning id`;if(!rows.length)return res.status(404).json({error:"Descuento no encontrado"});res.status(204).end()});

commerceRouter.get("/categories",requirePermission("products.read"),async(req,res)=>{const rows=await sql`select c.*,count(pc.product_id)::int as product_count from categories c left join product_categories pc on pc.category_id=c.id and pc.store_id=c.store_id where c.store_id=${req.storeId}::uuid group by c.id order by c.position,c.name`;res.json({categories:rows})});
commerceRouter.post("/categories",requirePermission("products.update"),async(req,res)=>{const p=req.body||{},name=String(p.name||"").trim(),slug=String(p.slug||name).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");if(!name||!slug)return res.status(400).json({error:"Nombre requerido"});try{const rows=await sql`insert into categories(store_id,name,slug,description,parent_id,position,active) values(${req.storeId}::uuid,${name},${slug},${p.description||null},${p.parent_id||null},${Number(p.position||0)},${p.active!==false}) returning *`;res.status(201).json({category:rows[0]})}catch(e){if(e.code==="23505")return res.status(409).json({error:"Ese slug ya existe"});throw e}});
commerceRouter.patch("/categories/:id",requirePermission("products.update"),async(req,res)=>{const p=req.body||{};const rows=await sql`update categories set name=coalesce(${p.name??null},name),description=coalesce(${p.description??null},description),position=coalesce(${p.position??null},position),active=coalesce(${typeof p.active==="boolean"?p.active:null},active) where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid returning *`;if(!rows.length)return res.status(404).json({error:"Categoría no encontrada"});res.json({category:rows[0]})});
commerceRouter.delete("/categories/:id",requirePermission("products.update"),async(req,res)=>{const rows=await sql`select bravoshop_delete_category(${req.params.id}::uuid,${req.storeId}::uuid) as deleted`;if(!rows[0]?.deleted)return res.status(404).json({error:"Categoría no encontrada"});res.status(204).end()});
commerceRouter.put("/products/:id/categories",requirePermission("products.update"),async(req,res)=>{const ids=Array.isArray(req.body?.category_ids)?req.body.category_ids:[];await sql`delete from product_categories where product_id=${req.params.id}::uuid and store_id=${req.storeId}::uuid`;for(const id of ids)await sql`insert into product_categories(product_id,category_id,store_id) select ${req.params.id}::uuid,${id}::uuid,${req.storeId}::uuid where exists(select 1 from products p where p.id=${req.params.id}::uuid and p.store_id=${req.storeId}::uuid) and exists(select 1 from categories c where c.id=${id}::uuid and c.store_id=${req.storeId}::uuid) on conflict do nothing`;const rows=await sql`select c.* from categories c join product_categories pc on pc.category_id=c.id and pc.store_id=c.store_id where pc.product_id=${req.params.id}::uuid and pc.store_id=${req.storeId}::uuid order by c.position,c.name`;res.json({categories:rows})});
