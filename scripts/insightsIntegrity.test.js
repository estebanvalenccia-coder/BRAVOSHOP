import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("insights routes stay structurally unique and stock threshold remains parameterized", async () => {
  const source=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
  assert.equal((source.match(/insightsRouter\.get\("\/dashboard"/g)||[]).length,1);
  assert.equal((source.match(/insightsRouter\.get\("\/inventory"/g)||[]).length,1);
  assert.equal((source.match(/insightsRouter\.get\("\/analytics"/g)||[]).length,1);
  assert.equal((source.match(/insightsRouter\.get\("\/inventory\/movements"/g)||[]).length,1);
  assert.ok(source.includes("const lowStockThreshold=Number.isSafeInteger(rawThreshold)&&rawThreshold>=1&&rawThreshold<=999?rawThreshold:3"));
  assert.ok(source.includes("and (i.quantity-i.reserved)<=${lowStockThreshold}"));
  assert.ok(source.includes("low_stock_threshold: lowStockThreshold"));
});

test("insights dashboard payment readiness requires platform Stripe configuration", async () => {
  const source=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
  assert.ok(source.includes("process.env.STRIPE_SECRET_KEY"));
  assert.ok(source.includes("process.env.STRIPE_PUBLISHABLE_KEY"));
  assert.ok(source.includes("process.env.STRIPE_WEBHOOK_SECRET"));
});
