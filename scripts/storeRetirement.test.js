import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{splitSqlStatements}from"./sqlStatements.js";

test("store retirement is reversible by support and has no destructive SQL DELETE",async()=>{
 const s=await readFile(new URL("../database/migrations/0072_safe_store_retirement.sql",import.meta.url),"utf8");
 assert.equal(splitSqlStatements(s).length,1);
 assert.ok(!/delete\s+from\s+(stores|orders|order_refunds|customers|products|store_subscriptions)/i.test(s));
 for(const fragment of [
  "bravoshop_retire_store(",
  "where id=p_store_id for update",
  "role='owner' and status='active'",
  "p_confirm_slug is distinct from s.slug",
  "provider_subscription_id is not null",
  "status not in ('canceled','expired','incomplete_expired')",
  "status in ('processing','pending')",
  "refund_reserved_total>0",
  "provider_payment_id is not null",
  "status='scheduled_for_deletion'",
  "'{\"published\":false}'::jsonb",
  "- 'preview_token'"
 ])assert.ok(s.includes(fragment),fragment);
});

test("only owners can request retirement and it requires a typed exact slug",async()=>{
 const s=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 assert.ok(s.includes('storesRouter.delete("/:storeId",requireStore'));
 assert.ok(s.includes('req.membership?.role!=="owner"'));
 assert.ok(s.includes('confirmSlug!==req.store.slug'));
 assert.ok(s.includes("bravoshop_retire_store("));
 assert.ok(s.includes("billing_active"));
 assert.ok(s.includes("refunds_pending"));
 assert.ok(s.includes("orders_pending"));
 assert.ok(s.includes("payments_pending"));
 assert.ok(s.includes("s.status<>'scheduled_for_deletion' order by s.created_at desc"));
});

test("retired shops cannot be resolved on custom domains or BravoShop subdomains",async()=>{
 const s=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 assert.ok(s.includes("where s.slug=${labels[0]} and s.status<>'scheduled_for_deletion'"));
 assert.ok(s.includes("d.status='verified' and s.status<>'scheduled_for_deletion'"));
});

test("owner store cards expose a confirmation dialog; no direct destructive click",async()=>{
 const s=await readFile(new URL("../src/platform/App.jsx",import.meta.url),"utf8");
 assert.ok(s.includes('s.role==="owner"&&<button'));
 assert.ok(s.includes("Eliminar tienda"));
 assert.ok(s.includes('role="dialog"'));
 assert.ok(s.includes('aria-modal="true"'));
 assert.ok(s.includes('disabled={busy||typedSlug!==deleting.slug}'));
 assert.ok(s.includes("await onDelete(deleting)"));
 assert.ok(s.includes("setStores(items=>items.filter(x=>x.id!==selected.id))"));
});

test("database readiness requires store retirement function migration",async()=>{
 const s=await readFile(new URL("../server/index.js",import.meta.url),"utf8");
 assert.ok(s.includes("name='0072_safe_store_retirement.sql'"));
});
