import test from "node:test";
import assert from "node:assert/strict";
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
