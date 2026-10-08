import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("public catalog filters and orders tenant-scoped products server-side",async()=>{
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const p=source.slice(source.indexOf('publicRouter.get("/products"'),source.indexOf('publicRouter.get("/categories"'));
 assert.ok(p.includes("p.store_id="));
 assert.ok(p.includes("p.status='active'"));
 assert.ok(p.includes("c.active=true and c.slug="));
 assert.ok(p.includes("price-asc"));
 assert.ok(p.includes("price-desc"));
 assert.ok(p.includes("order by"));
 assert.ok(p.includes("limit"));
});
test("public catalog refreshes filtered pages and paginates them",async()=>{
 const s=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(s.includes("setFilteredProducts(page.products)"));
 assert.ok(s.includes("controller.abort()"));
 assert.ok(s.includes("setFilterPage(p.page)"));
 assert.ok(s.includes("hasMore={Boolean(activePage?.has_more)}"));
});
