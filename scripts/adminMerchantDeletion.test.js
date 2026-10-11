import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {splitSqlStatements} from "./sqlStatements.js";

test("linked merchant deletion needs opt-in, suspends orphaned stores and never deletes stores",async()=>{
 const m=await readFile(new URL("../database/migrations/0078_admin_merchant_account_removal.sql",import.meta.url),"utf8");
 assert.equal(splitSqlStatements(m).length,1);
 const guards=["merchant.role <> 'merchant'","p_user_id = p_actor_id","p_unlink_stores is not true",
  "for update of s","other.role='owner' and other.status='active'",
  "provider_subscription_id is not null","provider_account_id is not null",
  "exists(select 1 from orders","status='suspended'","jsonb_build_object('published',false)",
  "update store_features set enabled=false","delete from app_users","insert into audit_log"];
 for(const guard of guards)assert.ok(m.includes(guard),"Missing merchant deletion invariant: "+guard);
 assert.ok(!/delete\s+from\s+stores\b/i.test(m),"Account deletion must never delete stores");
});
test("admin API and UI require explicit confirmation for linked merchant deletion",async()=>{
 const backend=await readFile(new URL("../server/routes/admin.js",import.meta.url),"utf8");
 const ui=await readFile(new URL("../src/platform/admin/SuperAdmin.jsx",import.meta.url),"utf8");
 const svc=await readFile(new URL("../src/platform/data/superAdminService.js",import.meta.url),"utf8");
 assert.ok(backend.includes('req.body?.acknowledge_unowned_stores!==true'));
 assert.ok(backend.includes('DESVINCULAR Y ELIMINAR USUARIOS'));
 assert.ok(backend.includes('bravoshop_admin_remove_merchant_account'));
 assert.ok(ui.includes('checked={unlinkStores}'));
 assert.ok(ui.includes('setUnlinkStores(e.target.checked);setPhrase("")'));
 assert.ok(ui.includes('Las tiendas NO se eliminarán'));
 assert.ok(!ui.includes('disabled={u.role!=="merchant"||Number(u.stores)>0||busy}'));
 assert.ok(svc.includes('acknowledge_unowned_stores:unlinkStores'));
});
