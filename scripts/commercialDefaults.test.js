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

test("plan access redemption refreshes store billing state immediately",async()=>{
 const source=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const start=source.indexOf('storesRouter.post("/:storeId/access-codes/redeem"');
 const end=source.indexOf('storesRouter.get("/:storeId/entitlements"',start);
 const block=source.slice(start,end);
 assert.ok(block.includes('if(result.grant_type==="plan")'));
 assert.ok(block.includes("bravoshop_refresh_store_billing"));
 assert.ok(block.includes("store_status:storeStatus"));
});

test("platform billing checkout requires webhook configuration",async()=>{
 const source=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 assert.ok(source.includes("const platformBillingConfigured=()=>Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET)"));
 const start=source.indexOf('storesRouter.post("/:storeId/billing/checkout"');
 const end=source.indexOf('storesRouter.post("/:storeId/billing/cancel"',start);
 const block=source.slice(start,end);
 assert.ok(block.includes("if(!platformBillingConfigured())"));
});

test("manual superadmin plan assignment is complimentary and excluded from paid MRR",async()=>{
 const source=await readFile(new URL("../server/routes/admin.js",import.meta.url),"utf8");
 const start=source.indexOf('adminRouter.put("/stores/:id/plan"');
 const end=source.indexOf('adminRouter.get("/access-codes"',start);
 const block=source.slice(start,end);
 assert.ok(block.includes("'Asignación Super Admin'"));
 assert.ok(block.includes("provider_subscription_id=null"));
 assert.ok(block.includes("complimentary:true"));
 assert.ok(source.includes("s.complimentary_reason is null"));
});

test("core commercial plans cannot be hidden from the public offer",async()=>{
 const source=await readFile(new URL("../server/routes/admin.js",import.meta.url),"utf8");
 assert.ok(source.includes('const publicPlan=["basic","premium"].includes(old.slug)?true:'));
 const ui=await readFile(new URL("../src/platform/admin/SuperAdmin.jsx",import.meta.url),"utf8");
 assert.ok(ui.includes("Público obligatorio"));
});
