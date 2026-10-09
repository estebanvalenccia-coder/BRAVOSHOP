import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {selectPublicStoreHost} from "../server/security/publicHost.js";
import {isPreviewContentRequest} from "../server/security/publicPreviewRoutes.js";

test("preview keeps strict origin isolation unless a token-authorized preview is requested",()=>{
 const host="mi-tienda.bravoshop.online";
 const origin="https://app.bravoshop.online";
 assert.deepEqual(selectPublicStoreHost({requestedHost:host,origin,requestHost:"api.bravoshop.online"}),
  {host:null,conflict:true});
 assert.deepEqual(selectPublicStoreHost({requestedHost:host,origin,allowPlatformPreview:true}),
  {host,conflict:false});
 assert.equal(selectPublicStoreHost({requestedHost:host,origin:"https://otra-tienda.bravoshop.online",allowPlatformPreview:true}).conflict,true);
 assert.equal(selectPublicStoreHost({requestedHost:"another.example",origin,allowPlatformPreview:true}).conflict,true);
 assert.equal(isPreviewContentRequest("GET","/store"),true);
 assert.equal(isPreviewContentRequest("POST","/checkout"),false);
});

test("preview link endpoint authenticates membership and creates a token for legacy stores",async()=>{
 const src=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const start=src.indexOf('storesRouter.post("/:storeId/preview-link"');
 const end=src.indexOf('storesRouter.get("/:storeId"',start);
 assert.ok(start>=0&&end>start,"private preview route registered before store lookup");
 const block=src.slice(start,end);
 for(const expected of [
  'requireStore,requirePermission("store.read")',
  "insert into store_settings",
  "on conflict(store_id) do update",
  "store_settings.settings->>'preview_token'",
  "jsonb_set(",
  "url.searchParams.set(\"host\",hostname)",
  "url.searchParams.set(\"preview_token\",token)",
  '"Cache-Control","private, no-store"'
 ])assert.ok(block.includes(expected),expected);
 assert.ok(block.includes('req.store.slug+".bravoshop.online"'));
 assert.ok(!block.includes("req.body?.host"));
 assert.ok(!block.includes("delete from"));
});

test("Storefront public fetch appends preview capability to read-only requests for matching host only",async()=>{
 const s=await readFile(new URL("../src/lib/api.js",import.meta.url),"utf8");
 const from=s.indexOf("export async function publicApi");
 const block=s.slice(from);
 assert.ok(block.includes('method==="GET"'));
 assert.ok(block.includes('window.location.pathname==="/preview"'));
 assert.ok(block.includes('current.get("host")===requested.get("host")'));
 assert.ok(block.includes('requested.set("preview_token",current.get("preview_token"))'));
 assert.ok(block.includes('credentials:"omit"'));
});

test("merchant Home, design iframe and Stores Hub use server-issued links instead of cached settings",async()=>{
 const admin=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const hub=await readFile(new URL("../src/platform/App.jsx",import.meta.url),"utf8");
 const service=await readFile(new URL("../src/platform/data/storeService.js",import.meta.url),"utf8");
 assert.ok(service.includes('api(`/api/stores/${storeId}/preview-link`,{method:"POST"'));
 assert.ok(service.includes('window.open("about:blank","_blank")'));
 assert.ok(service.includes("tab.opener=null"));
 assert.ok(admin.includes("openAuthenticatedStorePreview(store.id)"));
 assert.ok(admin.includes("getStorePreviewUrl(store.id)"));
 assert.ok(admin.includes('src={previewUrl+"&preview="+encodeURIComponent(theme.template)}'));
 assert.ok(hub.includes("openAuthenticatedStorePreview(s.id)"));
 assert.ok(!admin.includes('encodeURIComponent(store.settings?.preview_token||"")'));
 assert.ok(!hub.includes('encodeURIComponent(s.settings.preview_token)'));
});
