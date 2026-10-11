import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";

const load=file=>readFile(new URL(file,import.meta.url),"utf8");
test("Admin supports individual, visible-page, all-platform and excluded selections",async()=>{
 const ui=await load("../src/platform/admin/AdminStores.jsx");
 for(const pattern of [
  'const[selectedIds,setSelectedIds]', 'const[allSelected,setAllSelected]',
  'const[excludedIds,setExcludedIds]', 'const selectAllPlatform=async',
  'const togglePage=checked=>', 'const selectOne=(id,checked)=>',
  'scope:allSelected?"all":"selected"',
  'Seleccionar TODAS las tiendas existentes', 'Eliminar seleccionadas',
  'aria-label="Seleccionar todas las tiendas de esta página"',
  'checked={isChecked(store.id)}',
  'bulkPreview?.can_retire', 'bulkPreview?.can_purge',
  '"RETIRAR TIENDAS SELECCIONADAS"', '"ELIMINAR DEFINITIVAMENTE"'
 ])assert.ok(ui.includes(pattern),pattern);
 assert.ok(!ui.includes('bulkDeletePlatformStores('));
});

test("Backend does not limit all-selection to the 30 displayed stores",async()=>{
 const backend=await load("../server/routes/admin.js");
 const start=backend.indexOf("function bulkSelection("),end=backend.indexOf('adminRouter.get("/stores"',start);
 assert.ok(start>=0&&end>start);
 const api=backend.slice(start,end);
 for(const guard of [
  'scope:selected.scope', 'selected.excluded_ids', 's.id=any(${ids}::uuid[])',
  'and not(s.id=any(${excluded}::uuid[]))',
  'adminRouter.post("/stores/bulk/preview"',
  'adminRouter.post("/stores/bulk/execute"',
  'current.fingerprint!==req.body?.fingerprint',
  'action==="retire"?"RETIRAR TIENDAS SELECCIONADAS":"ELIMINAR DEFINITIVAMENTE"',
  'bravoshop_retire_store(', 'sql.transaction([',
  's.status=\'scheduled_for_deletion\'',
  'not exists(select 1 from orders v',
  'not exists(select 1 from stripe_webhook_events v',
  'not exists(select 1 from media_upload_intents mi',
  'not exists(select 1 from store_subscriptions v',
  "return res.status(409)", 'audit_log'
 ])assert.ok(api.includes(guard),guard);
 assert.ok(!api.includes("limit 30"));
});

test("Bulk destructive action requires explicit reason, phrase and live preview",async()=>{
 const ui=await load("../src/platform/admin/AdminStores.jsx");
 const backend=await load("../server/routes/admin.js");
 assert.ok(ui.includes("bulkReason.trim().length<10"));
 assert.ok(ui.includes("bulkPhrase!==phrase"));
 assert.ok(ui.includes("bulkPreview.fingerprint"));
 assert.ok(backend.includes("reason.length<10||reason.length>500"));
 assert.ok(backend.includes("current.fingerprint!==req.body?.fingerprint"));
 const service=await load("../src/platform/data/superAdminService.js");
 assert.ok(service.includes("function previewSelectedAdminStores("));
 assert.ok(service.includes("function executeSelectedAdminStores("));
});
