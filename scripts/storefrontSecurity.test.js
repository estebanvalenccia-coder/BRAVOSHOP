import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{safeStorefrontUrl,safeStorefrontImage,previewParentOrigin,isAllowedPreviewMessage}from"../src/platform/storefront/security.js";

test("storefront links reject executable and insecure schemes",()=>{
 assert.equal(safeStorefrontUrl("javascript:alert(1)","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("data:text/html,boom","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("http://evil.example","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("//evil.example","#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("/products/test"),"/products/test");
 assert.equal(safeStorefrontUrl("#catalog"),"#catalog");
 assert.equal(safeStorefrontUrl("mailto:shop@example.com"),"mailto:shop@example.com");
 assert.equal(safeStorefrontUrl("https://example.com/path"),"https://example.com/path");
});

test("storefront images allow only relative or HTTPS sources",()=>{
 assert.equal(safeStorefrontImage("javascript:alert(1)"),"");
 assert.equal(safeStorefrontImage("data:image/svg+xml,<svg/>"),"");
 assert.equal(safeStorefrontImage("http://example.com/x.jpg"),"");
 assert.equal(safeStorefrontImage("/media/x"),"/media/x");
 assert.equal(safeStorefrontImage("https://example.com/x.jpg"),"https://example.com/x.jpg");
});

test("theme preview messages require the trusted parent origin",()=>{
 assert.equal(previewParentOrigin({studio:"1",referrer:"https://app.bravoshop.online/store"}),"https://app.bravoshop.online");
 assert.equal(previewParentOrigin({studio:"1",referrer:"https://evil.example/embed"}),null);
 assert.equal(previewParentOrigin({studio:"0",referrer:"https://app.bravoshop.online/store"}),null);
 const parent={};
 assert.equal(isAllowedPreviewMessage({source:parent,origin:"https://app.bravoshop.online"},parent,"https://app.bravoshop.online"),true);
 assert.equal(isAllowedPreviewMessage({source:parent,origin:"https://evil.example"},parent,"https://app.bravoshop.online"),false);
});


test("public storefront API calls never include merchant session cookies", async () => {
	const apiSource=await readFile(new URL("../src/lib/api.js",import.meta.url),"utf8");
	const storefrontSource=await readFile(new URL("../src/platform/data/storefrontService.js",import.meta.url),"utf8");
	assert.ok(apiSource.includes('export async function publicApi'));
	assert.ok(apiSource.includes('credentials:"omit"'));
	assert.ok(storefrontSource.includes('import{publicApi}from"../../lib/api.js";'));
	assert.ok(!storefrontSource.includes('import{api}from"../../lib/api.js";'));
});


test("storefront checkout requires public commerce readiness",async()=>{
 const source=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 const publicSource=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 assert.ok(source.includes('store.commerce?.checkout_ready===true'));
 assert.ok(publicSource.includes('commerce:{checkout_ready:checkoutReady}'));
 assert.ok(publicSource.includes('process.env.STRIPE_WEBHOOK_SECRET'));
});


test("public checkout refuses to create sessions until payments are fully ready",async()=>{
 const source=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=source.indexOf('publicRouter.post("/checkout"');
 const normalized=source.indexOf("const normalized=[]",start);
 const readiness=source.indexOf("platformPaymentsReady",start);
 assert.ok(start>=0&&readiness>start&&readiness<normalized);
 assert.ok(source.slice(start,normalized).includes("payouts_enabled"));
 assert.ok(source.slice(start,normalized).includes("STRIPE_WEBHOOK_SECRET"));
});
