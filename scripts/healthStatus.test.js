import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("superadmin core health derives from actual live integration readiness",async()=>{
 const src=await readFile(new URL("../src/platform/admin/SuperAdmin.jsx",import.meta.url),"utf8");
 const summary=src.slice(src.indexOf("function Summary()"),src.indexOf("function Stores()"));
 assert.ok(summary.includes("getPlatformHealth().then(setHealth)"));
 assert.ok(summary.includes("states.map("));
 assert.ok(!summary.includes('["Storefront","Merchant Admin","API"'));
});
test("merchant launch checklist requires both platform and Connect webhook credentials",async()=>{
 const src=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 assert.ok(src.includes("STRIPE_CONNECT_WEBHOOK_SECRET&&payment[0]?.charges_enabled"));
});
