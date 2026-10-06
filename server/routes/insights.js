import { Router } from "express";
import { sql } from "../db/neon.js";
import { requireAuth, requireStore } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

export const insightsRouter = Router({ mergeParams: true });
insightsRouter.use(requireAuth, requireStore);

insightsRouter.get("/dashboard", requirePermission("analytics.read"), async (req, res) => {
	const [sales, orders, customers, products, lowStock] = await Promise.all([
		sql`select coalesce(sum(total),0)::numeric as value from orders where store_id=${req.storeId}::uuid and payment_status='paid'`,
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
	res.json({
		metrics: {
			sales: Number(sales[0].value),
			orders: orders[0].value,
			customers: customers[0].value,
			products: products[0].value,
			low_stock: lowStock[0].value,
		},
		recent_orders: recent,
	});
});

insightsRouter.get("/inventory", requirePermission("analytics.read"), async (req, res) => {
	const rows = await sql`
		select p.id as product_id,p.name as product_name,v.id as variant_id,v.title as variant_title,
			v.sku,coalesce(i.quantity,0)::int as quantity,coalesce(i.reserved,0)::int as reserved,
			coalesce(i.track_inventory,true) as track_inventory,
			coalesce(i.allow_backorder,false) as allow_backorder
		from products p
		join product_variants v on v.product_id=p.id
		left join inventory_levels i on i.variant_id=v.id
		where p.store_id=${req.storeId}::uuid
		order by p.name,v.title
	`;
	res.json({ inventory: rows });
});
