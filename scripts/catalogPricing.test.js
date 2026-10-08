import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCatalogPrice, parseVariantPrices, parseStockQuantity } from "../server/services/catalogPricing.js";

test("product prices accept free and exact two-decimal amounts", () => {
  for (const [input, expected] of [[undefined, 0], ["", 0], [0, 0], ["0.00", 0], ["19.95", 19.95], [123.4, 123.4], ["9999999999.99", 9999999999.99]]) {
    assert.deepEqual(parseCatalogPrice(input), { ok: true, value: expected });
  }
});

test("variant prices inherit parent price only when deliberately omitted", () => {
  assert.deepEqual(parseVariantPrices({}), { price: null, compare_at_price: null });
  assert.deepEqual(parseVariantPrices({ price: "", compare_at_price: null }), { price: null, compare_at_price: null });
  assert.deepEqual(parseVariantPrices({ price: 0, compare_at_price: "13.95" }), { price: 0, compare_at_price: 13.95 });
});

test("catalog prices reject invalid and dangerous values without rounding", () => {
  for (const value of [-1, "-1", 1.001, "1.001", "1e3", "NaN", Infinity, NaN, false, {}, [], "10,95", "99999999999.99", "  "]) {
    assert.equal(parseCatalogPrice(value).ok, false, `Must reject ${String(value)}`);
  }
  assert.equal(parseVariantPrices({ price: "1.001" }), null);
  assert.equal(parseVariantPrices({ compare_at_price: "-12" }), null);
});

test("both merchant create and update routes validate product and variant prices", async () => {
  const source = await readFile(new URL("../server/routes/commerce.js", import.meta.url), "utf8");
  assert.equal(source.split("parseCatalogPrice(p.price)").length - 1, 2);
  assert.equal(source.split("parseVariantPrices(v)").length - 1, 2);
  assert.ok(source.includes("return res.status(400).json({error:\"Precio de variante no válido\"})"));
});

test("stock updates reject missing values, negatives, decimals and database overflows", () => {
  for (const [input,expected] of [[0,0],["0",0],[42,42],["2147483647",2147483647]]) assert.equal(parseStockQuantity(input),expected);
  for (const input of [undefined,null,"",false,true,-1,"-1","1.5","1e3",2147483648,"2147483648",Infinity,{},[]]) assert.equal(parseStockQuantity(input),null);
});

test("inventory route validates before executing SQL", async () => {
  const source=await readFile(new URL("../server/routes/commerce.js",import.meta.url),"utf8");
  assert.ok(source.includes("const quantity=parseStockQuantity(i.quantity)"));
  assert.ok(source.includes("if(quantity===null)return res.status(400)"));
});
