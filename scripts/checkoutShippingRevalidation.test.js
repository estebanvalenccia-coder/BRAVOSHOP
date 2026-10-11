import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("payment rechecks active shipping zones, rate, tenant and country before inventory or Stripe",async()=>{
 const s=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=s.indexOf('publicRouter.post("/checkout/:token/payment"');
 const end=s.indexOf('publicRouter.get("/checkout/:token"',start);
 assert.ok(start>=0&&end>start);
 const checkout=s.slice(start,end);
 const recheck=checkout.indexOf('if(c.sector!=="services"){');
 const reservation=checkout.indexOf('bravoshop_reserve_checkout_inventory(');
 const zeroTotal=checkout.indexOf('if(Number(c.total)===0)');
 const stripe=checkout.indexOf('stripe.paymentIntents.create(');
 assert.ok(recheck>0&&recheck<reservation&&reservation<zeroTotal&&zeroTotal<stripe);
 for(const check of [
  "c.shipping_rate_id,c.shipping_address",
  'String(c.shipping_address?.country||"").trim().toUpperCase()',
  '!c.shipping_rate_id',
  "join shipping_zones z on z.id=r.zone_id and z.store_id=r.store_id",
  "r.store_id=${c.store_id}::uuid",
  "r.id=${c.shipping_rate_id}::uuid",
  "z.active=true and r.active=true",
  "${country}=any(z.countries)",
  "if(!validRate.length)",
  "res.status(409)"
 ])assert.ok(checkout.includes(check),check);
 assert.equal(checkout.indexOf('stripe.paymentIntents.create(')>recheck,true);
});

test("rejected old delivery can return to a fresh cart without reopening stale token",async()=>{
 const src=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(src.includes('onReturnToCart={()=>{setCheckout(null);setError("")'));
 assert.ok(src.includes('params.delete("checkout")'));
 assert.ok(src.includes('onReturnToCart()}}>Volver al carrito'));
 assert.ok(src.includes('setQuotedSignature(null);setPaymentStatus(null);onReturnToCart()'));
 assert.ok(src.includes('disabled={busy} onClick={()=>{setShippingRates([])'));
});
