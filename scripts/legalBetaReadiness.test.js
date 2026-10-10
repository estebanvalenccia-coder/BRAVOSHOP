import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {checkStoreLegalReadiness} from "../src/shared/storeLegalReadiness.js";

const seller={
 legal_name:"Tienda de prueba S.L.",tax_id:"B12345678",legal_address:"Calle Test 1, Madrid",
 legal_email:"administracion@example.test",privacy_notes:"La tienda trata datos de pedidos para entrega y servicio al cliente.",
 returns_policy:"Procedimiento de devoluciones: enviar correo al vendedor y verificar excepciones.",
 shipping_policy:"Enviamos a España con tarifas y plazos mostrados antes del pago."
};

test("physical commerce needs identity and seller-authored privacy, shipping and returns policies",()=>{
 const ok=checkStoreLegalReadiness(seller);
 assert.equal(ok.ready,true);
 assert.equal(ok.total,7);
 for(const key of ok.fields){
  const invalid=checkStoreLegalReadiness({...seller,[key]:"  "});
  assert.equal(invalid.ready,false,key);
  assert.ok(invalid.missing.includes(key),key);
 }
 assert.equal(checkStoreLegalReadiness({...seller,legal_email:"not-an-email"}).ready,false);
 assert.equal(checkStoreLegalReadiness({}).ready,false);
});

test("service shops do not require shipping disclosure, but still need seller notices",()=>{
 const {shipping_policy,...service}=seller;
 const ok=checkStoreLegalReadiness(service,{requiresShipping:false});
 assert.equal(ok.ready,true);
 assert.equal(ok.total,6);
 assert.ok(!ok.fields.includes("shipping_policy"));
 assert.equal(checkStoreLegalReadiness(service,{requiresShipping:true}).ready,false);
 assert.equal(checkStoreLegalReadiness({...service,privacy_notes:""},{requiresShipping:false}).ready,false);
});

test("checkout creation and payment tokens enforce legal, publication and email checks",async()=>{
 const api=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const creation=api.slice(api.indexOf('publicRouter.post("/checkout",'),api.indexOf('publicRouter.get("/recovery/:token"'));
 const payment=api.slice(api.indexOf('publicRouter.post("/checkout/:token/payment"'),api.indexOf('publicRouter.get("/checkout/:token"'));
 assert.ok(creation.includes("checkStoreLegalReadiness(settings,"));
 assert.ok(payment.includes('ss.settings as store_settings'));
 assert.ok(payment.includes('c.store_settings?.published!==true'));
 assert.ok(payment.includes('checkStoreLegalReadiness(c.store_settings,'));
 assert.ok(payment.includes('!process.env.RESEND_API_KEY||!process.env.BRAVOSHOP_EMAIL_FROM'));
 assert.ok(payment.indexOf("checkStoreLegalReadiness(c.store_settings,")<payment.indexOf("bravoshop_reserve_checkout_inventory("));
 assert.ok(payment.indexOf("c.store_settings?.published!==true")<payment.indexOf("stripe.paymentIntents.create("));
});

test("merchant and platform readiness agree on privacy and return requirements",async()=>{
 const merchant=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 const superAdmin=await readFile(new URL("../server/routes/admin.js",import.meta.url),"utf8");
 const ui=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 assert.ok(merchant.includes('checkStoreLegalReadiness(settings,'));
 for(const field of ["privacy_notes","returns_policy","shipping_policy"])
  assert.ok(superAdmin.includes("ss.settings->>'"+field+"'"),field);
 assert.ok(ui.includes("checkStoreLegalReadiness(s,"));
 assert.ok(ui.includes("{complete}/{legal.total} datos y políticas"));
});

test("cookies can be rejected and accepted with symmetric controls and later changed",async()=>{
 const source=await readFile(new URL("../src/platform/App.jsx",import.meta.url),"utf8");
 assert.ok(source.includes('bravoshop:manage-cookies'));
 assert.ok(source.includes("window.addEventListener(\"bravoshop:manage-cookies\""));
 assert.ok(source.includes("window.removeEventListener(\"bravoshop:manage-cookies\""));
 assert.ok(source.includes('Preferencias de cookies'));
 assert.ok(source.includes('className="ghost" onClick={()=>save("rejected")}'));
 assert.ok(source.includes('className="ghost" onClick={()=>save("accepted")}'));
 assert.ok(source.includes('bravoshop:cookie-consent'));
});
