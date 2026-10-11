import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {shippingQuoteSignature,currentShippingRates,selectedShippingRateId} from "../src/platform/storefront/shippingQuote.js";

const rates=[{id:"rate_economy",effective_price:5},{id:"rate_express",effective_price:12}];
const quote=shippingQuoteSignature("ES",21.90);

test("shipping quotes are keyed to an exact country and subtotal in cents",()=>{
 assert.equal(quote,"ES|2190");
 assert.equal(shippingQuoteSignature(" es ",21.9),"ES|2190");
 assert.equal(shippingQuoteSignature("ES",21.901),"ES|2190");
 assert.equal(shippingQuoteSignature("FR",21.9),"FR|2190");
 for(const subtotal of [Infinity,NaN,-1])assert.equal(shippingQuoteSignature("ES",subtotal),null);
 for(const country of ["","Spain","12"])assert.equal(shippingQuoteSignature(country,21.90),null);
});

test("changes of products or destination hide stale quotes and never submit stale rates",()=>{
 assert.deepEqual(currentShippingRates(rates,quote,"ES",21.9),rates);
 assert.deepEqual(currentShippingRates(rates,quote,"FR",21.9),[]);
 assert.deepEqual(currentShippingRates(rates,quote,"ES",22.9),[]);
 assert.deepEqual(currentShippingRates(rates,null,"ES",21.9),[]);
 assert.equal(selectedShippingRateId(rates,quote,"ES",21.9,"rate_express"),"rate_express");
 assert.equal(selectedShippingRateId(rates,quote,"ES",21.9,"not-in-current-quote"),undefined);
 assert.equal(selectedShippingRateId(rates,quote,"FR",21.9,"rate_express"),undefined);
 assert.equal(selectedShippingRateId(rates,quote,"ES",22.9,"rate_express"),undefined);
});

test("buyer frontend discards responses received for an outdated cart or country",async()=>{
 const ui=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.ok(ui.includes("quoteSignature!==currentQuoteRef.current"));
 assert.ok(ui.includes("request!==shippingRequestRef.current"));
 assert.ok(ui.includes('setQuotedSignature(quoteSignature)'));
 assert.ok(ui.includes('selectedShippingRateId(shippingRates,quotedSignature,address.country,total,shippingRateId)'));
 assert.ok(ui.includes('usableRates.length>0&&<div className="shippingChoices"'));
 assert.ok(ui.includes('usableRates.map(r=>'));
});
