import{Router}from"express";
import{sql}from"../db/neon.js";
import{requireAuth,requireStore}from"../middleware/auth.js";
import{requirePermission}from"../middleware/permissions.js";
import{csvDocument}from"../services/csv.js";
export const exportsRouter=Router({mergeParams:true});
exportsRouter.use(requireAuth,requireStore);
const LIMIT=10000;
const allowed={products:"products.read",orders:"orders.read",customers:"customers.read",inventory:"inventory.read"};
const columns={
 products:[["Producto","name"],["ID producto","product_id"],["Slug","slug"],["Estado","status"],["Tipo","product_type"],["Marca","vendor"],["Precio","price"],["ID variante","variant_id"],["Variante","variant_title"],["SKU","sku"],["Precio variante","variant_price"],["Existencias","quantity"],["Reservadas","reserved"],["Creado","created_at"]],
 orders:[["ID pedido","id"],["Fecha","created_at"],["Email cliente","customer_email"],["Nombre cliente","customer_name"],["Estado pago","payment_status"],["Estado entrega","fulfillment_status"],["Total","total"],["Reembolsado","refunded_total"],["Moneda","currency"],["Transportista","carrier"],["Seguimiento","tracking_number"]],
 customers:[["ID cliente","id"],["Nombre","name"],["Email","email"],["Teléfono","phone"],["Pedidos","order_count"],["Valor acumulado","lifetime_value"],["Último pedido","last_order_at"],["Cliente desde","created_at"]],
 inventory:[["ID producto","product_id"],["Producto","product_name"],["ID variante","variant_id"],["Variante","variant_title"],["SKU","sku"],["Precio unitario","unit_price"],["Existencias","quantity"],["Reservadas","reserved"],["Controlar stock","track_inventory"],["Permitir venta sin stock","allow_backorder"]]
};
exportsRouter.get("/:kind",(req,res,next)=>{
 const permission=allowed[req.params.kind];
 if(!permission)return res.status(404).json({error:"Exportación no disponible"});
 return requirePermission(permission)(req,res,next);
},async(req,res)=>{
 const id=req.storeId;let rows;
 switch(req.params.kind){
 case "products":
 rows=await sql`select p.id as product_id,p.name,p.slug,p.status,p.product_type,p.vendor,p.price,p.created_at,
 v.id as variant_id,v.title as variant_title,v.sku,v.price as variant_price,
 coalesce(i.quantity,0) as quantity,coalesce(i.reserved,0) as reserved
 from products p left join product_variants v on v.product_id=p.id and v.store_id=p.store_id
 left join inventory_levels i on i.variant_id=v.id
 where p.store_id=${id}::uuid order by p.created_at desc,v.created_at limit ${LIMIT}`;
 break;
 case "orders":
 rows=await sql`select o.id,o.created_at,o.customer_email,coalesce(c.name,'') as customer_name,
 o.payment_status,o.fulfillment_status,o.total,o.refunded_total,o.currency,o.carrier,o.tracking_number
 from orders o left join customers c on c.id=o.customer_id and c.store_id=o.store_id
 where o.store_id=${id}::uuid order by o.created_at desc limit ${LIMIT}`;
 break;
 case "customers":
 rows=await sql`select c.id,c.name,c.email,c.phone,c.created_at,count(o.id)::int as order_count,
 coalesce(sum(case when o.payment_status in ('paid','partially_refunded') then greatest(0,o.total-coalesce(o.refunded_total,0)) else 0 end),0) as lifetime_value,
 max(o.created_at) as last_order_at from customers c
 left join orders o on o.customer_id=c.id and o.store_id=c.store_id
 where c.store_id=${id}::uuid group by c.id order by c.created_at desc limit ${LIMIT}`;
 break;
 case "inventory":
 rows=await sql`select p.id as product_id,p.name as product_name,v.id as variant_id,v.title as variant_title,v.sku,
 coalesce(v.price,p.price,0) as unit_price,coalesce(i.quantity,0) as quantity,coalesce(i.reserved,0) as reserved,
 coalesce(i.track_inventory,true) as track_inventory,coalesce(i.allow_backorder,false) as allow_backorder
 from products p join product_variants v on v.product_id=p.id and v.store_id=p.store_id
 left join inventory_levels i on i.variant_id=v.id
 where p.store_id=${id}::uuid order by p.name,v.title limit ${LIMIT}`;
 break;
 default:return res.status(404).json({error:"Exportación no disponible"});
 }
 const kind=req.params.kind;
 res.set("Content-Type","text/csv; charset=utf-8");
 res.set("Cache-Control","private, no-store");
 res.set("Content-Disposition",`attachment; filename="bravoshop-${kind}-${new Date().toISOString().slice(0,10)}.csv"`);
 res.set("X-Export-Row-Limit",String(LIMIT));
 res.status(200).send(csvDocument(columns[kind],rows));
});
