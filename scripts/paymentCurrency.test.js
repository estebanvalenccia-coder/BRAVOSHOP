import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { requiresCurrencyMinorUnitUpgrade, isValidTwoDecimalStripeAmount } from "../server/services/paymentCurrency.js";

test("checkout refuses currencies that need non-cent Stripe amount representation", () => {
  for (const currency of ["JPY","KRW","CLP","VND","XOF","XAF","BIF","DJF","GNF","KMF","MGA","PYG","RWF","UGX","VUV","XPF"])
    assert.equal(requiresCurrencyMinorUnitUpgrade(currency), true, currency);
  assert.equal(requiresCurrencyMinorUnitUpgrade("jpy"), true);
  for (const currency of ["EUR","USD","GBP","CAD","ISK","TWD","HUF","CHF"])
    assert.equal(requiresCurrencyMinorUnitUpgrade(currency), false, currency);
});

test("cents-based Stripe checkout admits exact cents and checks Stripe maximum size", () => {
  for (const value of [0,0.01,1.25,999999.99,"15.50"])
    assert.equal(isValidTwoDecimalStripeAmount(value), true, String(value));
  for (const value of [-0.01,0.001,2.999,1000000,Infinity,NaN,"hello",null])
    assert.equal(isValidTwoDecimalStripeAmount(value), value===null, String(value));
});

test("public checkout guards currency on both creation and payment before Stripe call", async () => {
  const source = await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
  assert.ok(source.includes("if(requiresCurrencyMinorUnitUpgrade(currency))return res.status(422)"));
  assert.ok(source.includes("if(requiresCurrencyMinorUnitUpgrade(c.currency))return res.status(422)"));
  assert.ok(source.includes("!isValidTwoDecimalStripeAmount(totalCents/100)"));
  assert.ok(source.includes("!isValidTwoDecimalStripeAmount(c.total)"));
  assert.ok(source.indexOf("if(requiresCurrencyMinorUnitUpgrade(c.currency))") <
    source.indexOf("stripe.paymentIntents.create("));
  assert.ok(source.indexOf("if(requiresCurrencyMinorUnitUpgrade(c.currency))") <
    source.indexOf("bravoshop_reserve_checkout_inventory("));
});
