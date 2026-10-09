import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{splitSqlStatements}from"./sqlStatements.js";

test("recovery is atomic, owner-scoped and cannot republish a store",async()=>{
 const s=await readFile(new URL("../database/migrations/0073_restore_retired_store.sql",import.meta.url),"utf8");
 assert.equal(splitSqlStatements(s).length,1);
 for(const guard of [
  "bravoshop_restore_store(",
  "where id=p_store_id for update",
  "where store_id=p_store_id and user_id=p_owner_id",
  "role='owner' and status='active'",
  "p_confirm_slug is distinct from s.slug",
  "s.status<>'scheduled_for_deletion'",
  "status='unpaid'",
  "jsonb_build_object('published',false,'preview_token',gen_random_uuid()::text)"
 ])assert.ok(s.includes(guard),guard);
 assert.ok(!/delete\s+from/i.test(s));
 assert.ok(!s.includes("status='active'"));
 assert.ok(!s.includes("status='trial'"));
 assert.ok(!s.includes("update store_subscriptions"));
 assert.ok(!s.includes("update store_features"));
});

test("retired store API is auth-only and explicitly checks owner without requireStore",async()=>{
 const src=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const listStart=src.indexOf('storesRouter.get("/retired"');
 const restoreStart=src.indexOf('storesRouter.post("/retired/:storeId/restore"');
 const createStart=src.indexOf('storesRouter.post("/",');
 assert.ok(listStart>=0&&restoreStart>listStart&&createStart>restoreStart);
 const flow=src.slice(listStart,createStart);
 assert.ok(flow.includes("sm.user_id=${req.user.id}::uuid and sm.role='owner'"));
 assert.ok(flow.includes("sm.status='active' and s.status='scheduled_for_deletion'"));
 assert.ok(flow.includes("bravoshop_restore_store("));
 assert.ok(flow.includes("req.body?.confirm_slug"));
 assert.ok(flow.includes("reason"));
 assert.ok(!flow.includes("requireStore"));
 assert.ok(src.includes("storesRouter.use(requireAuth)"));
});

test("merchant hub exposes Papelera and an exact-slug protected recovery dialog",async()=>{
 const src=await readFile(new URL("../src/platform/App.jsx",import.meta.url),"utf8");
 for(const fragment of [
  "listRetiredStores()",
  'Papelera',
  'Recuperar tienda',
  'aria-label="Recuperar tienda"',
  "disabled={busy||confirmRestore!==restoring.slug}",
  "await restoreRetiredStore(restoring.id,restoring.slug)",
  "setTrash(rows=>rows.filter",
  'hadRetired?"stores":"onboarding"'
 ])assert.ok(src.includes(fragment),fragment);
});

test("recovery cannot accidentally pass health checks before the migration is installed",async()=>{
 const s=await readFile(new URL("../server/index.js",import.meta.url),"utf8");
 assert.ok(s.includes("name='0073_restore_retired_store.sql'"));
});
