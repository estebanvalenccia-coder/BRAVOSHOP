import { Router } from "express";
import { sql } from "../db/neon.js";
import { requireAuth, requireStore } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

export const insightsRouter = Router({ mergeParams: true });
insightsRouter.use(requireAuth, requireStore);

insightsRouter.get("/dashboard", requirePermission("analytics.read"), async (req, res) => {
	const [sales, orders, customers, products, lowStock] = await Promise.all([
		sql`select coalesce(sum(greatest(0,total-refunded_total)),0)::numeric as value from orders where store_id=${req.storeId}::uuid and payment_status in ('paid','partially_refunded')`,
		sql`select count(*)::int as value from orders where store_id=${req.storeId}::uuid`,
		sql`select count(*)::int as value from customers where store_id=${req.storeId}::uuid`,
		sql`select count(*)::int as value from products where store_id=${req.storeId}::uuid`,
		sql`
			select count(*)::int as value
			from inventory_levels i
			join product_variants v on v.id=i.variant_id
			join products p on p.id=v.product_id
			where p.store_id=${req.storeId}::uuid
				and i.track_inventory=true
				and (i.quantity-i.reserved)<=3
		`,
	]);
	const recent = await sql`
		select id,status,payment_status,total,currency,customer_email,created_at
		from orders
		where store_id=${req.storeId}::uuid
		order by created_at desc
		limit 6
	`;
	const [payment,shipping,domain,legal,activeProducts,pendingOrders]=await Promise.all([
		sql`select charges_enabled,payouts_enabled,status from store_payment_accounts where store_id=${req.storeId}::uuid limit 1`,
		sql`select count(distinct z.id)::int as value from shipping_zones z join shipping_rates r on r.zone_id=z.id and r.active=true where z.store_id=${req.storeId}::uuid and z.active=true`,
		sql`select count(*)::int as value from domains where store_id=${req.storeId}::uuid and status='verified'`,
		sql`select ss.settings,s.status,s.slug from stores s left join store_settings ss on ss.store_id=s.id where s.id=${req.storeId}::uuid limit 1`,
		sql`select count(*)::int as value from products where store_id=${req.storeId}::uuid and status='active'`,
		sql`select count(*)::int as value from orders where store_id=${req.storeId}::uuid and coalesce(fulfillment_status,'unfulfilled') in ('unfulfilled','preparing')`
	]);
	const settings=legal[0]?.settings||{};
	const legalComplete=["legal_name","tax_id","legal_address","legal_email"].every(k=>String(settings[k]||"").trim());
	res.json({
		metrics: {
			sales: Number(sales[0].value),
			orders: orders[0].value,
			customers: customers[0].value,
			products: products[0].value,
			low_stock: lowStock[0].value,
		},
		recent_orders: recent,
		operations:{store_status:legal[0]?.status||"draft",slug:legal[0]?.slug||null,active_products:activeProducts[0].value,pending_orders:pendingOrders[0].value,payments_ready:Boolean(payment[0]?.charges_enabled&&payment[0]?.payouts_enabled&&payment[0]?.status==="active"),payouts_ready:Boolean(payment[0]?.payouts_enabled),shipping_ready:shipping[0].value>0,custom_domain_ready:domain[0].value>0,legal_ready:legalComplete,notifications_ready:Boolean(process.env.RESEND_API_KEY&&process.env.BRAVOSHOP_EMAIL_FROM),published:settings.published===true},
	});
});

insightsRouter.get("/inventory", requirePermission("analytics.read"), async (req, res) => {
	const rows = await sql`
		select p.id as product_id,p.name as product_name,v.id as variant_id,v.title as variant_title,
			v.sku,coalesce(v.price,p.price,0)::numeric as unit_price,coalesce(i.quantity,0)::int as quantity,coalesce(i.reserved,0)::int as reserved,
			coalesce(i.track_inventory,true) as track_inventory,
			coalesce(i.allow_backorder,false) as allow_backorder
		from products p
		join product_variants v on v.product_id=p.id and v.store_id=${req.storeId}::uuid
		left join inventory_levels i on i.variant_id=v.id
		where p.store_id=${req.storeId}::uuid
		order by p.name,v.title
	`;
	res.json({ inventory: rows });
});

insightsRouter.get("/analytics", requirePermission("analytics.read"), async (req, res) => {
	const [daily, topProducts, statuses, repeatCustomers] = await Promise.all([
		sql`select to_char(d::date,'YYYY-MM-DD') as day,coalesce(sum(greatest(0,o.total-o.refunded_total)) filter(where o.payment_status in ('paid','partially_refunded')),0)::numeric as sales,count(o.id) filter(where o.payment_status in ('paid','partially_refunded'))::int as orders from generate_series(current_date-29,current_date,'1 day') d left join orders o on o.store_id=${req.storeId}::uuid and o.created_at>=d and o.created_at<d+'1 day'::interval group by d order by d`,
		sql`select oi.title,coalesce(sum(oi.quantity),0)::int as units,coalesce(sum(oi.total),0)::numeric as revenue from order_items oi join orders o on o.id=oi.order_id where o.store_id=${req.storeId}::uuid and o.payment_status in ('paid','partially_refunded') group by oi.title order by revenue desc limit 8`,
		sql`select coalesce(fulfillment_status,'unfulfilled') as status,count(*)::int as value from orders where store_id=${req.storeId}::uuid group by fulfillment_status order by value desc`,
		sql`select count(*)::int as value from (select customer_email from orders where store_id=${req.storeId}::uuid and customer_email is not null group by customer_email having count(*)>1) x`
	]);
	const sales30=daily.reduce((n,x)=>n+Number(x.sales),0),orders30=daily.reduce((n,x)=>n+Number(x.orders),0);
	res.json({period_days:30,metrics:{sales:sales30,orders:orders30,average_order:orders30?sales30/orders30:0,repeat_customers:repeatCustomers[0].value},daily:daily.map(x=>({...x,sales:Number(x.sales)})),top_products:topProducts.map(x=>({...x,revenue:Number(x.revenue)})),order_statuses:statuses});
});

insightsRouter.get("/inventory/movements", requirePermission("inventory.read"), async (req,res)=>{
 const rows=await sql`
  select im.id,im.type,im.quantity_delta,im.reserved_delta,im.reference_type,im.reference_id,im.created_at,
   v.sku,v.title as variant_title,p.name as product_name,u.email as actor_email
  from inventory_movements im
  join product_variants v on v.id=im.variant_id and v.store_id=im.store_id
  join products p on p.id=v.product_id and p.store_id=im.store_id
  left join app_users u on u.id=im.actor_user_id
  where im.store_id=${req.storeId}::uuid
  order by im.created_at desc
  limit 200`;
 res.json({movements:rows});
});
