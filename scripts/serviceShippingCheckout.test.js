import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("service-only stores offer no physical shipping options even with stale zones",async()=>{
 const api=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=api.indexOf('publicRouter.get("/shipping-rates"');
 const end=api.indexOf('publicRouter.post("/checkout"',start);
 assert.ok(start>=0&&end>start);
 const route=api.slice(start,end);
 const service=route.indexOf('if(req.publicStore.sector==="services")return res.json({rates:[]})');
 const rateQuery=route.indexOf('from shipping_rates r join shipping_zones z');
 assert.ok(service>=0&&rateQuery>service);
});

test("service checkout never selects a delivery rate or charges stale country zones",async()=>{
 const api=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=api.indexOf('publicRouter.post("/checkout",');
 const end=api.indexOf('publicRouter.get("/recovery/:token"',start);
 assert.ok(start>=0&&end>start);
 const route=api.slice(start,end);
 assert.ok(route.includes('if(country&&req.publicStore.sector!=="services"){'));
 assert.ok(route.includes('if(req.publicStore.sector!=="services"&&zones[0].n>0'));
 assert.ok(route.includes('let shippingCents=0,shippingRateId=null,shippingRateName=null;'));
 const selectRate=route.indexOf('const requestedRate=req.body.shipping_rate_id||null;');
 assert.ok(selectRate>route.indexOf('if(country&&req.publicStore.sector!=="services"){'));
});

test("sector switch blocks old shipping charges before inventory and Stripe",async()=>{
 const api=await readFile(new URL("../server/routes/public.js",import.meta.url),"utf8");
 const start=api.indexOf('publicRouter.post("/checkout/:token/payment"');
 const end=api.indexOf('publicRouter.get("/checkout/:token"',start);
 const route=api.slice(start,end);
 assert.ok(route.includes('c.shipping_rate_id,c.shipping_address,c.shipping_total'));
 const guard=route.indexOf('if(c.sector==="services"&&(Number(c.shipping_total)!==0||c.shipping_rate_id))');
 const reserve=route.indexOf('bravoshop_reserve_checkout_inventory(');
 const stripe=route.indexOf('stripe.paymentIntents.create(');
 assert.ok(guard>0&&reserve>guard&&stripe>reserve);
 assert.ok(route.includes('La tienda ya no requiere envío'));
});
