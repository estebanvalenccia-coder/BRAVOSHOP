import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{validateCheckoutAddress}from"../server/services/checkoutAddress.js";

const full={name:"  Cliente Real ",line1:" Avenida del Mar 10 ",city:" Barcelona ",postal_code:" 08032 ",country:"es"};

test("physical shipping checkout needs delivery fields and trims them",()=>{
 const ready=validateCheckoutAddress(full);
 assert.equal(ready.ok,true);
 assert.deepEqual(ready.address,{name:"Cliente Real",line1:"Avenida del Mar 10",city:"Barcelona",postal_code:"08032",country:"ES"});
 for(const missing of ["name","line1","city","postal_code","country"]){
  const trial={...full};
  delete trial[missing];
  assert.equal(validateCheckoutAddress(trial).ok,false,missing);
  assert.equal(validateCheckoutAddress({...full,[missing]:"   "}).ok,false,missing+" whitespace");
 }
 for(const bad of [null,[],{},false,"hello"]){
  assert.equal(validateCheckoutAddress(bad).ok,false,String(bad));
 }
 assert.equal(validateCheckoutAddress({...full,country:"España"}).ok,false);
});

test("countries without conventional postal codes may omit postcode, but still require street and city",()=>{
 for(const country of ["AE","HK","MO","QA"]){
  assert.equal(validateCheckoutAddress({...full,country,postal_code:""}).ok,true,country);
 }
 assert.equal(validateCheckoutAddress({...full,country:"ES",postal_code:""}).ok,false);
});

test("service checkout requires named customer but no delivery street or postcode",()=>{
 const result=validateCheckoutAddress({name:" Maria Gómez ",country:""}, {requiresShipping:false});
 assert.equal(result.ok,true);
 assert.equal(result.address.name,"Maria Gómez");
 assert.equal(validateCheckoutAddress({name:" "},{requiresShipping:false}).ok,false);
});

test("invalid addresses are rejected before payment checkout is saved or coupons reserved",async()=>{
 const src=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=src.indexOf('publicRouter.post("/checkout",');
 const end=src.indexOf('publicRouter.get("/recovery/:token"',start);
 const flow=src.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.ok(flow.includes('validateCheckoutAddress(req.body.shipping_address,'));
 assert.ok(flow.includes('requiresShipping:req.publicStore.sector!=="services"'));
 assert.ok(flow.includes('if(!delivery.ok)return res.status(422)'));
 assert.ok(flow.includes("req.body.shipping_address=delivery.address"));
 assert.ok(flow.indexOf("if(!delivery.ok)")<flow.indexOf("const queries=["));
 assert.ok(flow.indexOf("if(!delivery.ok)")<flow.indexOf("bravoshop_claim_discount_exact("));
});
