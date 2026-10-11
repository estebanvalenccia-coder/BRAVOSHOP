import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Super Admin store list offers management, retirement, recovery and conditional hard deletion",async()=>{
 const code=await read("../src/platform/admin/AdminStores.jsx");
 for(const fragment of [
  "queryAdminStores(", "retireAdminStore(", "restoreAdminStore(",
  "checkAdminStoreDeletion(", "deleteAdminStorePermanently(",
  'operation==="purge"', "check?.eligible===true",
  'typedSlug===chosen?.slug', 'typedPhrase==="ELIMINAR DEFINITIVAMENTE"',
  "reason.trim().length>=10", 'rel="noopener noreferrer"',
  "No se public", "No se pueden"
 ].slice(0,11))assert.ok(code.includes(fragment),fragment);
 assert.ok(code.includes('filter]=useState("live")'));
 assert.ok(code.includes("status")||code.includes("STATUSES"));
});

test("Administrative retirement reuses financial guards and is audited",async()=>{
 const code=await read("../server/routes/admin.js");
 for(const fragment of [
  'adminRouter.post("/stores/:id/retire"',
  'adminRouter.post("/stores/:id/restore"',
  "bravoshop_retire_store(", "bravoshop_restore_store(",
  "store.admin_retired", "store.admin_restored",
  "billing_active", "refunds_pending", "payments_pending",
  'reason.length<10',
  'adminRouter.delete("/stores/:id/permanent"',
  'adminRouter.get("/stores/:id/deletion-check"',
  'confirmation!=="ELIMINAR DEFINITIVAMENTE"',
  's.status=\'scheduled_for_deletion\'',
  "stripe_webhook_events", "store_subscriptions",
  "provider_customer_id", "notification_outbox", "newsletter_subscribers",
  "media_assets", "order_refunds", "store_payment_accounts",
  "not exists(select 1 from orders",
  '"deleted_store"'
 ])assert.ok(code.includes(fragment),fragment);
 assert.ok(code.includes('and s.status=\'scheduled_for_deletion\''));
});

test("Retired stores are excluded from the ordinary management list, but retained for recovery",async()=>{
 const source=await read("../server/routes/admin.js");
 assert.ok(source.includes("s.status<>'scheduled_for_deletion'"));
 assert.ok(source.includes("s.status='scheduled_for_deletion'"));
 assert.ok(source.includes('"retired"'));
 const service=await read("../src/platform/data/superAdminService.js");
 for(const method of ["queryAdminStores","retireAdminStore","restoreAdminStore","checkAdminStoreDeletion","deleteAdminStorePermanently"])assert.ok(service.includes("function "+method));
});

test("Admin management does not silently sign in to a merchant store",async()=>{
 const ui=await read("../src/platform/admin/AdminStores.jsx");
 assert.ok(ui.includes("https://"+'"'+store.slug+".bravoshop.online"'));
 assert.ok(!ui.includes("impersonate"));
 assert.ok(!ui.includes("preview_token"));
});
