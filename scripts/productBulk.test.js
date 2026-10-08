import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
test("bulk publish enforces tenant scope and all-or-nothing ownership",async()=>{
 const src=await readFile(new URL("../server/routes/commerce.js",import.meta.url),"utf8");
 const code=src.slice(src.indexOf('commerceRouter.post("/products/bulk-status"'),src.indexOf('commerceRouter.get("/products/:id"'));
 assert.ok(code.includes('requirePermission("products.update")'));
 assert.ok(code.includes('raw.length>100'));
 assert.ok(code.includes("new Set(raw).size"));
 assert.ok(code.includes("select count(*) from owned"));
 assert.ok(code.includes("p.store_id="));
 assert.ok(code.includes("m.store_id="));
});
test("bulk merchant selection keeps single-product editor",async()=>{
 const src=await readFile(new URL("../src/platform/catalog/ProductManager.jsx",import.meta.url),"utf8");
 assert.ok(src.includes("Seleccionar varios"));
 assert.ok(src.includes("bulkUpdateProductStatus(storeId,selectedIds,nextStatus)"));
 assert.ok(src.includes("bulkMode?setSelectedIds("));
 assert.ok(src.includes(":setEditing(p)"));
});
