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

test("live storefront readiness verifies HTTPS and real compiled SPA shell",async()=>{
 const {inspectStorefrontShell}=await import("./storefrontShellCheck.js");
 const expected="shop.bravoshop.online";
 const good={url:"https://"+expected+"/products/example",status:200,contentType:"text/html; charset=utf-8",body:'<!doctype html><div id="root"></div><script type="module" src="/assets/index-1234.js"></script>'};
 assert.deepEqual(inspectStorefrontShell(good,expected),{status:200,spa_shell:true,https:true});
 assert.throws(()=>inspectStorefrontShell({...good,url:"https://bravoshop.online"},expected),/fuera de su subdominio/);
 assert.throws(()=>inspectStorefrontShell({...good,status:404},expected),/HTTP 404/);
 assert.throws(()=>inspectStorefrontShell({...good,body:"<div>no application</div>"},expected),/aplicación/);
 assert.throws(()=>inspectStorefrontShell({...good,body:'<div id="root"></div>'},expected),/JavaScript/);
 const deployment=await readFile(new URL("./postdeploy-check.js",import.meta.url),"utf8");
 assert.ok(deployment.includes('await checkStorefrontHttps("/products/bravoshop-synthetic-link-probe")'));
});

test("production DNS failures give actionable merchant CNAME and Railway target diagnostics",async()=>{
 const code=await readFile(new URL("./postdeploy-check.js",import.meta.url),"utf8");
 for(const name of ["resolveCname(storefrontHost)","resolve4(target)","resolveNs(\"bravoshop.online\")","authoritative_nameservers","merchant_cname","railway_target_ipv4"])
  assert.ok(code.includes(name),name);
 assert.ok(code.includes('if(requireStorefrontDns)throw new Error("Merchant storefront DNS failed'));
});
