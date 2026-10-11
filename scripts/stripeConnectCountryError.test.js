import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripeExpressCountryWarning} from "../src/shared/stripeExpressCountry.js";
import {stripeConnectCountryIssue,stripeConnectSetupError} from "../server/services/stripeConnect.js";

test("Colombia legal country remains storable but cannot cause an unsupported Express creation",()=>{
 assert.match(stripeExpressCountryWarning("CO"),/Colombia/);
 assert.match(stripeExpressCountryWarning(" co "),/CO/);
 assert.equal(stripeConnectCountryIssue("CO")?.code,"STRIPE_CONNECT_COUNTRY_UNAVAILABLE");
 assert.match(stripeConnectCountryIssue("CO")?.error,/No cambies el país/);
 for(const country of ["ES","US","MX","FR",""]){
  // No local whitelist: final eligibility is determined by Stripe.
  assert.equal(stripeExpressCountryWarning(country),null);
  assert.equal(stripeConnectCountryIssue(country),null);
 }
});

test("Stripe API country and currency problems return actionable errors instead of 500",()=>{
 for(const input of [
  {type:"StripeInvalidRequestError",message:"The country CO is not supported for Express accounts"},
  {type:"StripeInvalidRequestError",code:"country_unsupported",message:"Invalid account"},
  {type:"StripeInvalidRequestError",message:"Your platform cannot create accounts in this country"},
 ]){
  assert.equal(stripeConnectSetupError(input)?.code,"STRIPE_CONNECT_COUNTRY_UNSUPPORTED");
 }
 assert.equal(stripeConnectSetupError({type:"StripeInvalidRequestError",message:"Invalid requested capabilities"})?.code,"STRIPE_CONNECT_CONFIGURATION_INVALID");
 assert.equal(stripeConnectSetupError({type:"StripeInvalidRequestError",message:"Connect must be enabled to create connected accounts"})?.code,"STRIPE_CONNECT_SETUP_REQUIRED");
 assert.equal(stripeConnectSetupError({type:"StripeCardError",message:"Card declined"}),null);
});

test("merchant Stripe route rejects unsupported legal country before creating an account",async()=>{
 const s=await readFile(new URL("../server/routes/stores.js",import.meta.url),"utf8");
 const a=s.indexOf('storesRouter.post("/:storeId/payments/connect"');
 const b=s.indexOf('storesRouter.post("/:storeId/payments/sync"',a);
 assert.ok(a>=0&&b>a);
 const segment=s.slice(a,b);
 assert.ok(segment.includes("stripeConnectCountryIssue(rows[0].country)"));
 assert.ok(segment.includes("if(unsupportedCountry)return res.status(422).json(unsupportedCountry)"));
 assert.ok(segment.indexOf("stripeConnectCountryIssue(rows[0].country)")<segment.indexOf("stripe.accounts.create("));
 assert.ok(segment.includes("stripeConnectSetupError(e)"));
 assert.ok(segment.includes('issue.code==="STRIPE_CONNECT_COUNTRY_UNSUPPORTED"'));
 assert.ok(segment.includes('idempotencyKey:`bravoshop-connect-${req.storeId}`'));
 const preferences=s.slice(s.indexOf('storesRouter.put("/:storeId/payments/preferences"'),a);
 assert.ok(preferences.includes("country=excluded.country"),"preserve merchant's actual legal country and currency");
});

test("merchant UI warns before clicking Connect, and never submits an unpersisted country",async()=>{
 const s=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const a=s.indexOf("function Payments("),b=s.indexOf("function CategoriesManager(",a);
 assert.ok(a>=0&&b>a);
 const ui=s.slice(a,b);
 for(const expected of [
  'stripeExpressCountryWarning(p?.country)',
  "Stripe Connect no disponible para este país",
  "https://stripe.com/global",
  "setSavedPaymentSettings(",
  'const unsavedSettings=Boolean(',
  "(!linked&&Boolean(countryWarning))",
  "(!linked&&unsavedSettings)",
  "Guarda primero país y divisa"
 ])assert.ok(ui.includes(expected),expected);
});
