import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
test("merchant export action is wired across all four modules",async()=>{
 for(const [path,kind] of [["catalog/ProductManager.jsx","products"],["admin/OrdersManager.jsx","orders"],["admin/CustomersManager.jsx","customers"],["admin/InventoryManager.jsx","inventory"]]){
 const source=await readFile(new URL("../src/platform/"+path,import.meta.url),"utf8");
 assert.ok(source.includes('kind="'+kind+'"'));
 assert.ok(source.includes("<ExportCsvButton"));
 }
 const client=await readFile(new URL("../src/platform/data/exportService.js",import.meta.url),"utf8");
 assert.ok(client.includes('credentials:"include"'));
 assert.ok(client.includes('"/exports/"+kind'));
});
