import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("commercial defaults seed paid monthly plans without overwriting configured prices",async()=>{
 const source=await readFile(new URL("../database/migrations/0064_commercial_defaults.sql",import.meta.url),"utf8");
 assert.ok(source.includes("'Basic','basic','active',14.99"));
 assert.ok(source.includes("'Premium','premium','active',29.99"));
 assert.ok(source.includes("monthly_price=coalesce(plans.monthly_price,excluded.monthly_price)"));
 assert.ok(source.includes("'premium_templates'"));
});

test("master access code is generated at migration time and grants permanent Premium",async()=>{
 const source=await readFile(new URL("../database/migrations/0064_commercial_defaults.sql",import.meta.url),"utf8");
 assert.ok(source.includes("'BRAVO-MASTER-'||upper(substr(replace(gen_random_uuid()"));
 assert.ok(source.includes("'Código Máster BravoShop'"));
 assert.ok(source.includes("'plan'"));
 assert.ok(source.includes('{"master":true}'));
});
