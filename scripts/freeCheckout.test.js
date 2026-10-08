import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { splitSqlStatements } from "./sqlStatements.js";

const migrationPath = new URL("../database/migrations/0069_free_checkout.sql", import.meta.url);
const apiPath = new URL("../server/routes/public.js", import.meta.url);
const uiPath = new URL("../src/platform/storefront/Storefront.jsx", import.meta.url);

test("zero-total order migration contains exactly one PL/pgSQL function", async () => {
 const source = await readFile(migrationPath, "utf8");
 const parsed = splitSqlStatements(source);
 assert.equal(parsed.length, 1, "SQL migration must remain an atomic function definition");
 assert.match(source, /create or replace function bravoshop_complete_free_checkout\(/i);
 assert.match(source, /returns uuid/i);
});

test("free checkout is tenant-scoped, zero-only and protected against races", async () => {
 const source = await readFile(migrationPath, "utf8");
 for (const guard of [
  "where id=p_checkout_id and store_id=p_store_id for update",
  "checkout_row.total<>0",
  "checkout_row.status<>'payment_pending'",
  "checkout_row.expires_at<=now()",
  "not checkout_row.inventory_reserved",
  "checkout_row.provider_payment_id is not null",
  "checkout_row.payment_creation_started_at is not null",
  "checkout_row.completed_order_id is not null",
  "payment_provider='free' and payment_status='paid' and total=0",
  "status in ('active','trial')",
  "inventory_row.reserved<item_row.quantity",
  "variant_store is distinct from p_store_id"
 ]) assert.ok(source.includes(guard), guard);
});

test("zero-total orders preserve accounting and inventory but do not invent Stripe events", async () => {
 const source = await readFile(migrationPath, "utf8");
 for (const expected of [
  "checkout_row.discount_total",
  "checkout_row.discount_code",
  "checkout_row.shipping_rate_id",
  "checkout_row.tax_total",
  "checkout_row.shipping_total",
  "checkout_row.currency",
  "checkout_row.customer_email",
  "checkout_row.shipping_address",
  "on conflict do nothing",
  "insert into order_items",
  "insert into inventory_movements",
  "reserved=reserved-item_row.quantity",
  "payment_provider='free'",
  "'confirmed','paid','unfulfilled'",
  "'order.free_confirmed'",
  "return checkout_row.completed_order_id"
 ]) assert.ok(source.includes(expected), expected);
 assert.ok(!source.includes("stripe_webhook_events"), "Free orders must not write fictitious Stripe webhooks");
 assert.ok(!source.includes("'payment.succeeded'"), "Free orders must not impersonate a Stripe payment");
});

test("public payment route handles zero before Stripe and retries completed free orders", async () => {
 const source = await readFile(apiPath, "utf8");
 const route = source.slice(source.indexOf('publicRouter.post("/checkout/:token/payment"'), source.indexOf('publicRouter.get("/checkout/:token"'));
 const free = route.indexOf("if(Number(c.total)===0)");
 const stripe = route.indexOf("stripe.paymentIntents.create(");
 assert.ok(free >= 0 && stripe > free);
 assert.ok(route.includes("bravoshop_reserve_checkout_inventory"));
 assert.ok(route.includes("bravoshop_complete_free_checkout("));
 assert.ok(route.includes("o.payment_provider='free'"));
 assert.ok(route.includes("await enqueueOrderNotification("));
 assert.ok(route.includes('res.json({provider:"free",status:"completed",order_id:'));
 assert.ok(route.includes('res.json({provider:"stripe",client_secret:'));
 assert.ok(source.includes("o.payment_provider,"));
});

test("storefront confirms free order without mounting Stripe Elements", async () => {
 const source = await readFile(uiPath, "utf8");
 const start = source.indexOf("const pay=async()");
 const end = source.indexOf(";useEffect(", start);
 const pay = source.slice(start, end);
 assert.ok(pay.includes("if(Number(checkout.total)===0)"));
 assert.ok(pay.indexOf("await onRefreshCheckout()") < pay.indexOf("getPublicPaymentConfig("));
 assert.ok(source.includes("Confirmar pedido gratuito"));
 assert.ok(source.includes('checkout.payment_provider==="free"?"Pedido gratuito confirmado":"Pago confirmado"'));
});

test("readiness requires free checkout database migration before deployment", async () => {
 const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
 assert.ok(source.includes("name='0069_free_checkout.sql'"));
});
