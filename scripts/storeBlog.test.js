import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
test("blog merchant routes enforce tenant and permissions",async()=>{
 const s=await readFile(new URL("../server/routes/blog.js",import.meta.url),"utf8");
 assert.ok(s.includes("requireAuth,requireStore"));
 assert.ok(s.includes('requirePermission("marketing.manage")'));
 assert.ok(s.includes('requirePermission("marketing.read")'));
 assert.ok(s.includes("where b.store_id="));
 assert.ok(s.includes("La imagen no pertenece a esta tienda"));
});
test("public blog returns only published posts of resolved store",async()=>{
 const s=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const a=s.indexOf('publicRouter.get("/blog/posts"'),b=s.indexOf('publicRouter.get("/products"',a);
 const block=s.slice(a,b);
 assert.ok(block.includes('publicFeatureEnabled(req.publicStore.id,"blog")'));
 assert.ok(block.includes("b.status='published'"));
 assert.ok(block.includes("b.store_id="));
});
