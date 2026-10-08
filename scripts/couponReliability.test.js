import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {splitSqlStatements} from "./sqlStatements.js";
import {parseCatalogPrice,parseStockQuantity} from "../server/services/catalogPricing.js";

test("coupon values and minimum amounts reject sub-cent money", () => {
 for(const bad of ["9.999","15.005",-5,"NaN",Infinity,{},false,"10000000000.00"]){
  assert.equal(parseCatalogPrice(bad).ok,false,"Should reject "+String(bad));
 }
 for(const value of [0,"0.00",0.01,"15.95","100.00"]){
  assert.equal(parseCatalogPrice(value).ok,true,"Should accept "+String(value));
 }
});

test("coupon usage limits fit PostgreSQL integer range", () => {
 for(const input of [1,"1",999,2147483647])assert.ok(parseStockQuantity(input)>0);
 for(const input of [0,-1,1.2,"12.5",2147483648,"Infinity","NaN",""])assert.ok((parseStockQuantity(input)||0)<1);
});

test("coupon creation and edition validate numbers before writing", async () => {
 const src=await readFile(new URL("../server/routes/commerce.js",import.meta.url),"utf8");
 const start=src.indexOf('commerceRouter.post("/discounts"');
 const edit=src.indexOf('commerceRouter.patch("/discounts/:id"');
 const end=src.indexOf('commerceRouter.delete("/discounts/:id"');
 assert.ok(start>=0&&edit>start&&end>edit);
 const create=src.slice(start,edit),update=src.slice(edit,end);
 for(const code of [create,update]){
  assert.ok(code.includes("parseCatalogPrice("));
  assert.ok(code.includes("parseStockQuantity("));
  assert.ok(code.includes("parsedValue.ok"));
  assert.ok(code.includes("parsedMinimum.ok"));
  assert.ok(code.includes('kind==="percent"&&value>100'));
  assert.ok(code.includes("usage===null||usage<1"));
  assert.ok(code.includes("return res.status(400).json("));
 }
});

test("expiry migration selects only unsettled work with bounded locking", async () => {
 const src=await readFile(new URL("../database/migrations/0070_bounded_checkout_expiry.sql",import.meta.url),"utf8");
 const stmts=splitSqlStatements(src);
 assert.equal(stmts.length,2);
 const functionSrc=stmts[1];
 for(const part of [
  "bravoshop_release_expired_inventory_reservations()",
  "expires_at<=now()",
  "status<>'completed'",
  "status<>'expired'",
  "inventory_reserved=true",
  "discount_usage_released_at is null",
  "order by expires_at,id",
  "limit 200",
  "for update skip locked",
  "bravoshop_release_checkout_inventory(r.id,'expired',null)",
  "bravoshop_release_checkout_discount(r.id)"
 ])assert.ok(functionSrc.includes(part),part);
 assert.ok(!src.includes("delete from checkout_sessions"));
});

test("readiness gates the new cleanup migration", async () => {
 const src=await readFile(new URL("../server/index.js",import.meta.url),"utf8");
 assert.ok(src.includes("name='0070_bounded_checkout_expiry.sql'"));
});
