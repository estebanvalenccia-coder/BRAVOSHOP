import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";

test("every merchant navigation item resolves to a real workspace",async()=>{
 const source=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const keys=["home","products","categories","orders","customers","team","inventory","design","media","marketing","analytics","domains","payments","billing","shipping","legal","settings"];
 for(const key of keys){
  assert.ok(source.includes(`section==="${key}"`),`merchant section ${key} has no workspace route`);
 }
 assert.equal((source.match(/<ModuleHub/g)||[]).length,0);
});
