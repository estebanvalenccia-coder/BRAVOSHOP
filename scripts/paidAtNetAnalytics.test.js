import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("all commercial 30-day analytics dates are settled payment dates, not draft order dates",async()=>{
 const source=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 const segment=source.slice(source.indexOf('insightsRouter.get("/analytics"'),source.indexOf('insightsRouter.get("/inventory/movements"'));
 assert.equal((segment.match(/paid_at>=/g)||[]).length,4);
 assert.ok(!segment.includes("o.created_at"));
 assert.ok(!segment.includes("and created_at>="));
 assert.ok(segment.includes("o.paid_at<d+'1 day'::interval"));
 assert.ok(segment.includes("payment_status in ('paid','partially_refunded')"));
});

test("top products respect item identity, actual successful refunds and discount/tax allocation",async()=>{
 const source=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 const start=source.indexOf("sql`select oi.product_id,oi.title,");
 const end=source.indexOf("`,\n\t\tsql`select coalesce(fulfillment_status",start);
 assert.ok(start>=0&&end>start);
 const query=source.slice(start,end);
 for(const expected of [
  "group by oi.product_id,oi.title",
  "oi.quantity-coalesce(returned.units,0)",
  "ri.order_item_id=oi.id",
  "rr.status='succeeded'",
  "rr.order_id=o.id",
  "rr.store_id=o.store_id",
  "o.subtotal-o.discount_total",
  "coalesce(returned.refund_amount,0)",
  "o.tax_total",
  "having sum(greatest(0,oi.quantity-coalesce(returned.units,0)))>0"
 ])assert.ok(query.includes(expected),expected);
 assert.ok(!query.includes("coalesce(sum(oi.total)"));
 const ui=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 assert.ok(ui.includes('key={x.product_id+"-"+x.title}'));
 assert.ok(ui.includes("los reembolsos generales no se pueden atribuir a un producto concreto"));
});
