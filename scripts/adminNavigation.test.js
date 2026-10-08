import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";

test("every merchant navigation item resolves to a real workspace",async()=>{
 const source=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const keys=["home","products","categories","orders","customers","team","inventory","design","media","marketing","analytics","domains","payments","billing","shipping","legal","settings"];
 for(const key of keys){
  assert.ok(source.includes(`activeSection==="${key}"`),`merchant section ${key} has no workspace route`);
 }
 assert.equal((source.match(/<ModuleHub/g)||[]).length,0);
});

test("merchant admin navigation follows backend tenant permissions, not decorative role guesses",async()=>{
 const {filterMerchantMenu,resolveMerchantSection}=await import("../src/platform/admin/sectionAccess.js");
 const {permissionsForRole}=await import("../server/middleware/permissions.js");
 const menu=[["icon","Inicio","home"],["icon","Productos","products"],["icon","Pedidos","orders"],["icon","Equipo","team"],["icon","Pagos","payments"],["icon","Plan BravoShop","billing"],["icon","Marketing","marketing"],["icon","Diseño","design"],["icon","Dominios","domains"]];
 const owner=filterMerchantMenu(menu,permissionsForRole("owner"),"owner");
 assert.equal(owner.length,menu.length);
 const staff=filterMerchantMenu(menu,permissionsForRole("staff"),"staff");
 assert.deepEqual(staff.map(x=>x[2]),["home","products","orders"]);
 const support=filterMerchantMenu(menu,permissionsForRole("support"),"support");
 assert.deepEqual(support.map(x=>x[2]),["orders"]);
 assert.equal(resolveMerchantSection("billing",support),"orders");
 const manager=filterMerchantMenu(menu,permissionsForRole("manager"),"manager");
 assert.equal(manager.some(x=>x[2]==="billing"),true);
 assert.equal(manager.some(x=>x[2]==="payments"),true);
 assert.equal(manager.some(x=>x[2]==="team"),false);
 assert.equal(filterMerchantMenu(menu,undefined,"owner").length,0);
 const backend=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const admin=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 assert.ok(backend.includes("role:req.membership.role,permissions:req.permissions"));
 assert.ok(admin.includes("filterMerchantMenu(menu,current.permissions,current.role)"));
 assert.ok(admin.includes("resolveMerchantSection(section,visibleMenu)"));
});

test("read-only merchant roles never see buttons for Stripe account mutations or subscriptions",async()=>{
 const source=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 assert.ok(source.includes('canManage={privileges.has("payments.manage")}'));
 assert.ok(source.includes('canManage={privileges.has("billing.manage")}'));
 assert.ok(source.includes('privileges.has("billing.manage")&&<AccessCode'));
 assert.ok(source.includes("function Payments({store,canManage=false})"));
 assert.ok(source.includes('disabled={linked||!canManage}'));
 assert.ok(source.includes("{canManage&&!active&&<button"));
 assert.ok(source.includes("{canManage&&p.provider_account_id&&<button"));
 assert.ok(source.includes("function PlatformBilling({store,canManage=false})"));
 assert.ok(source.includes('disabled={!canManage||!data.provider_configured'));
});
