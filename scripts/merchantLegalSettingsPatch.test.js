import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {MERCHANT_LEGAL_SETTING_KEYS,merchantLegalSettingsPatch} from "../src/platform/admin/merchantLegalSettings.js";

test("legal edit preserves only merchant-authorized legal fields",()=>{
 const source={
  name:"Do not update store name",published:true,preview_token:"private-preview",
  seo_title:"Do not overwrite SEO",template:"do-not-overwrite",
  legal_name:"Tienda S.L.",tax_id:"B12345678",legal_address:"Calle Ejemplo",
  legal_email:"legal@example.test",legal_phone:"123456789",privacy_email:"privacy@example.test",
  privacy_notes:"Aviso personal",shipping_policy:"Tarifas propias",returns_policy:"14 días",returns_days:14
 };
 const patch=merchantLegalSettingsPatch(source);
 assert.deepEqual(Object.keys(patch).sort(),[...MERCHANT_LEGAL_SETTING_KEYS].sort());
 for(const forbidden of ["name","published","preview_token","seo_title","template"])assert.ok(!Object.hasOwn(patch,forbidden),forbidden);
 assert.equal(patch.legal_name,source.legal_name);
 assert.equal(patch.returns_days,14);
});

test("form can clear optional fields without resetting unrelated settings",()=>{
 assert.deepEqual(merchantLegalSettingsPatch({legal_phone:"",returns_policy:"",preview_token:"do-not-send"}),{legal_phone:"",returns_policy:""});
 assert.deepEqual(merchantLegalSettingsPatch(null),{});
 assert.deepEqual(merchantLegalSettingsPatch([]),{});
});

test("merchant legal save sends settings only and backend merges patches with current settings",async()=>{
 const ui=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const route=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const start=ui.indexOf("function LegalCompliance(");
 const end=ui.indexOf("function ",start+10);
 const form=ui.slice(start,end);
 assert.ok(form.includes("updateStore(store.id,{settings:merchantLegalSettingsPatch(full.settings)})"));
 assert.ok(!form.includes("theme:full.theme"));
 assert.ok(!form.includes("name:full.name"));
 assert.ok(route.includes("settings=store_settings.settings||excluded.settings"));
 assert.ok(route.includes("delete safeSettings.published"));
 assert.ok(route.includes("delete safeSettings.preview_token"));
});
