import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{csvCell,csvDocument}from"../server/services/csv.js";
test("CSV neutralizes formula injection, quotes and newlines",()=>{
 assert.equal(csvCell("=SUM(1,2)"),'"\'=SUM(1,2)"');
 assert.equal(csvCell("  @cmd"),'"\'  @cmd"');
 assert.equal(csvCell("-10"),'"\'-10"');
 assert.equal(csvCell('a"b'),'"a""b"');
 assert.equal(csvCell("x\nz"),'"x\nz"');
 assert.equal(csvCell(null),'""');
 assert.ok(csvDocument([["Nombre","name"]],[{name:"=bad"}]).startsWith("\uFEFF"));
});
test("exports require tenant auth and resource permissions",async()=>{
 const source=await readFile(new URL("../server/routes/exports.js",import.meta.url),"utf8");
 assert.match(source,/requireAuth,requireStore/);
 for(const pair of ['products:"products.read"','orders:"orders.read"','customers:"customers.read"','inventory:"inventory.read"'])assert.ok(source.includes(pair));
 assert.equal((source.match(/where [pc o]\.store_id=\$\{id\}::uuid/g)||[]).length,4);
 assert.ok(source.includes('private, no-store'));
});
