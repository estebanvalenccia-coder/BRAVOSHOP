import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {canStartCheckout,updatedCartQuantity} from "../src/platform/storefront/checkoutForm.js";
import {validateCheckoutAddress} from "../server/services/checkoutAddress.js";

const base={name:"Cliente",line1:"Calle Real 1",city:"Madrid",postal_code:"28001",country:"ES"};

test("storefront requires a deliverable contact for physical goods",()=>{
 assert.equal(canStartCheckout("client@example.com",base),true);
 for(const field of ["name","line1","city","postal_code","country"]){
  assert.equal(canStartCheckout("client@example.com",{...base,[field]:"  "}),false,field);
 }
 assert.equal(canStartCheckout("not-an-email",base),false);
 assert.equal(canStartCheckout("client@example.com",{...base,country:"ESP"}),false);
});

test("postal-code exemptions match the server for jurisdictions without postal codes",()=>{
 for(const country of ["AE","HK","MO","QA"]){
  const address={...base,country,postal_code:""};
  assert.equal(canStartCheckout("client@example.com",address),true,country);
  assert.equal(validateCheckoutAddress(address).ok,true,country);
 }
 const address={...base,postal_code:""};
 assert.equal(canStartCheckout("client@example.com",address),false);
 assert.equal(validateCheckoutAddress(address).ok,false);
});

test("service-sector checkout still requires a customer name and valid email, but no street",()=>{
 assert.equal(canStartCheckout("client@example.com",{name:"Cliente"},false),true);
 assert.equal(canStartCheckout("client@example.com",{name:"  "},false),false);
 assert.equal(canStartCheckout("bad",{name:"Cliente"},false),false);
});

test("quantity controls respect the API limit of 1–99 for retained cart lines",()=>{
 assert.equal(updatedCartQuantity(99,1),99);
 assert.equal(updatedCartQuantity(98,1),99);
 assert.equal(updatedCartQuantity(1,-1),0);
 assert.equal(updatedCartQuantity(10,1),11);
 assert.equal(updatedCartQuantity(5,Number.NaN),0);
});

test("storefront locks repeated checkout submission until request settles",async()=>{
 const source=await readFile(new URL("../src/platform/storefront/Storefront.jsx",import.meta.url),"utf8");
 assert.match(source,/checkoutRequestRef\.current=true/);
 assert.match(source,/if\(checkoutRequestRef\.current\|\|!ready\)return/);
 assert.match(source,/finally\{checkoutRequestRef\.current=false/);
 assert.match(source,/disabled=\{checkoutBusy\|\|!cart\.length\|\|!ready\}/);
});
