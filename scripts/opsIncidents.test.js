import test from"node:test";
import assert from"node:assert/strict";
import{readFile}from"node:fs/promises";
test("Railway incident webhook requires an opaque ingest token",async()=>{
 const source=await readFile(new URL("../server/routes/opsWebhook.js",import.meta.url),"utf8");
 assert.ok(source.includes("RAILWAY_WEBHOOK_INGEST_TOKEN"));
 assert.ok(source.includes("timingSafeEqual"));
 assert.ok(source.includes('res.status(404).end()'));
 assert.ok(source.includes("platform_incidents"));
});
test("platform health exposes recent infrastructure incidents",async()=>{
 const source=await readFile(new URL("../server/routes/admin.js",import.meta.url),"utf8");
 assert.ok(source.includes("from platform_incidents order by received_at desc limit 25"));
 assert.ok(source.includes("incidents"));
});
