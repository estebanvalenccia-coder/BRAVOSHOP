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

test("merchant dashboard hides publication and product creation for read-only roles",async()=>{
 const source=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 assert.ok(source.includes('availableSections={visibleMenu.map(x=>x[2])}'));
 assert.ok(source.includes('store.permissions.includes("store.update")'));
 assert.ok(source.includes('store.permissions.includes("products.create")'));
 assert.ok(source.includes("{canPublish&&<button"));
 assert.ok(source.includes('{canCreateProduct&&<button onClick={()=>navigate("products")}'));
 assert.ok(source.includes('disabled={!availableSections.includes(x.go)}'));
 assert.ok(source.includes('.filter(([,key])=>availableSections.includes(key))'));
});

test("design studio keeps React hooks unconditional and shows real photographic templates",async()=>{
 const source=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const start=source.indexOf("function StoreSettings("),end=source.indexOf("function ",start+20);
 const body=source.slice(start,end>start?end:source.length);
 const loading=body.indexOf('if(!full)return <article className="panel">');
 const previewHook=body.indexOf('useEffect(()=>{if(mode!=="design"||!full)return;');
 assert.ok(loading>0&&previewHook>0&&previewHook<loading,"preview hook must precede conditional render");
 assert.ok(body.includes('"https://app.bravoshop.online");send()'));
 assert.ok(body.includes('src={TEMPLATE_IMAGE_URLS[t.id]}'));
 assert.ok(body.includes("Guardar diseño"));
 assert.ok(!body.includes("Guardar y publicar"));
});

test("visual design editor supports deterministic undo and unique section ids",async()=>{
 const source=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const begin=source.indexOf("function StoreSettings(");
 const end=source.indexOf("function ",begin+20);
 const editor=source.slice(begin,end>begin?end:undefined);
 assert.ok(editor.includes("const patchTheme=next=>{const before=normalizeTheme(full.theme||{})"));
 assert.ok(editor.includes("setFull(x=>({...x,theme:{...normalizeTheme(x.theme||{}),...next}}))"));
 assert.ok(editor.includes("id:src.type+\"-\"+crypto.randomUUID()"));
 assert.ok(editor.includes("id:type+\"-\"+crypto.randomUUID()"));
 assert.ok(editor.includes("patchTheme(applyTemplate(t.id,full.theme||{}))"));
 assert.ok(!editor.includes('setHistory(h=>[...h.slice(-29),before]);setFuture([]);return'));
});
