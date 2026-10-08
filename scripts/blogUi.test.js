import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
test("blog is available in merchant and removed from roadmap",async()=>{
 const admin=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const flags=await readFile(new URL("../src/platform/config/features.js",import.meta.url),"utf8");
 assert.ok(admin.includes('<BlogManager store={current}/>'));
 assert.ok(admin.includes('"Blog","blog"'));
 assert.ok(flags.includes('"marketing","blog"'));
 const roadmap=flags.match(/ROADMAP_FEATURES=\[([^\]]*)\]/)?.[1]||"";assert.ok(!roadmap.includes('"blog"'));
});
test("public blog route and media picker are connected",async()=>{
 const store=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 const manager=await readFile(new URL("../src/platform/admin/BlogManager.jsx",import.meta.url),"utf8");
 assert.ok(store.includes('<StoreBlogPage store={store} host={host}'));
 assert.ok(manager.includes('onPick={asset=>'));
 assert.ok(manager.includes('saveBlogPost(store.id'));
});
