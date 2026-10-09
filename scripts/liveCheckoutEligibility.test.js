import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  meetsStripeMinimumCharge,merchantStripeAccountReady,checkoutControlEnabled
} from "../server/services/paymentCurrency.js";

const ready={provider:"stripe",status:"active",provider_account_id:"acct_valid",charges_enabled:true,payouts_enabled:true};

test("two-decimal Stripe minimums reject positive micro-payments while preserving free orders",()=>{
 for(const currency of ["EUR","USD","CAD","AUD","CHF"]){
  assert.equal(meetsStripeMinimumCharge(0,currency),true,currency);
  assert.equal(meetsStripeMinimumCharge(49,currency),false,currency);
  assert.equal(meetsStripeMinimumCharge(50,currency),true,currency);
 }
 assert.equal(meetsStripeMinimumCharge(29,"GBP"),false);
 assert.equal(meetsStripeMinimumCharge(30,"GBP"),true);
 assert.equal(meetsStripeMinimumCharge(1499,"CZK"),false);
 assert.equal(meetsStripeMinimumCharge(1500,"CZK"),true);
 assert.equal(meetsStripeMinimumCharge(199,"PLN"),false);
 assert.equal(meetsStripeMinimumCharge(200,"PLN"),true);
 for(const invalid of [-1,0.25,Infinity,NaN,null]) assert.equal(meetsStripeMinimumCharge(invalid,"EUR"),false,String(invalid));
 assert.equal(meetsStripeMinimumCharge(1,"ZZZ"),true,"unknown currency still validated by Stripe");
});

test("disabled/restricted/unverified Stripe merchants cannot be paid with preexisting checkout tokens",()=>{
 assert.equal(merchantStripeAccountReady(ready),true);
 for(const change of [
  {provider:"other"},{status:"restricted"},{status:"onboarding"},
  {provider_account_id:null},{charges_enabled:false},{payouts_enabled:false},
  {charges_enabled:null},{payouts_enabled:null}
 ])assert.equal(merchantStripeAccountReady({...ready,...change}),false,JSON.stringify(change));
 assert.equal(merchantStripeAccountReady(null),false);
});

test("checkout platform controls default enabled only when the toggle is missing",()=>{
 assert.equal(checkoutControlEnabled([]),true);
 assert.equal(checkoutControlEnabled([{enabled:true}]),true);
 assert.equal(checkoutControlEnabled([{enabled:false}]),false);
});

test("checkout creation stops sub-minimum totals before coupon claim transaction",async()=>{
 const src=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=src.indexOf('publicRouter.post("/checkout",');
 const end=src.indexOf('publicRouter.get("/recovery/:token"',start);
 const block=src.slice(start,end);
 assert.ok(block.includes("merchantStripeAccountReady(paymentAccount)"));
 assert.ok(block.includes("checkoutControlEnabled(controls)"));
 assert.ok(block.includes("!meetsStripeMinimumCharge(totalCents,currency)"));
 assert.ok(block.indexOf("!meetsStripeMinimumCharge(totalCents,currency)")<block.indexOf("const queries=["));
});

test("existing checkout rechecks platform controls and connected account before reserving stock and contacting Stripe",async()=>{
 const src=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=src.indexOf('publicRouter.post("/checkout/:token/payment"');
 const end=src.indexOf('publicRouter.get("/checkout/:token"',start);
 const block=src.slice(start,end);
 for(const guard of [
  "pa.status as account_status",
  "pa.payouts_enabled",
  "checkoutControlEnabled(controls)",
  "merchantStripeAccountReady({...c,status:c.account_status})",
  "!meetsStripeMinimumCharge(Math.round(Number(c.total)*100),c.currency)",
  "publicFeatureEnabled(c.store_id,\"checkout\")"
 ])assert.ok(block.includes(guard),guard);
 const reservation=block.indexOf("bravoshop_reserve_checkout_inventory(");
 const stripe=block.indexOf("stripe.paymentIntents.create(");
 assert.ok(reservation>0&&stripe>reservation);
 for(const guard of ["checkoutControlEnabled(controls)","merchantStripeAccountReady({...c,status:c.account_status})","!meetsStripeMinimumCharge("]){
  assert.ok(block.indexOf(guard)>=0&&block.indexOf(guard)<reservation,guard);
 }
});

test("public Stripe configuration respects global checkout and merchant settlement restrictions",async()=>{
 const src=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=src.indexOf('publicRouter.get("/payment-config"');
 const end=src.indexOf('publicRouter.get("/blog/posts"',start);
 const block=src.slice(start,end);
 assert.ok(block.includes("publicFeatureEnabled(req.publicStore.id,\"checkout\")"));
 assert.ok(block.includes("checkoutControlEnabled(controls)"));
 assert.ok(block.includes("merchantStripeAccountReady(p)"));
 assert.ok(block.includes("payouts_enabled"));
});
