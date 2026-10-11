import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {canPrepareOrder,isOrderAwaitingFulfillment} from "../src/shared/fulfillmentReadiness.js";

test("only confirmed paid orders can enter the shipping work queue",()=>{
 for(const payment_status of ["paid","partially_refunded"]){
  assert.equal(canPrepareOrder({payment_status,fulfillment_status:"unfulfilled"}),true,payment_status);
  assert.equal(isOrderAwaitingFulfillment({payment_status,fulfillment_status:"unfulfilled"}),true);
  assert.equal(isOrderAwaitingFulfillment({payment_status,fulfillment_status:"preparing"}),true);
  assert.equal(isOrderAwaitingFulfillment({payment_status,fulfillment_status:"fulfilled"}),false);
 }
 for(const payment_status of ["pending","failed","refunded","cancelled",null,undefined]){
  assert.equal(canPrepareOrder({payment_status,fulfillment_status:"unfulfilled"}),false,String(payment_status));
  assert.equal(isOrderAwaitingFulfillment({payment_status,fulfillment_status:"preparing"}),false,String(payment_status));
 }
 assert.equal(canPrepareOrder(null),false);
 assert.equal(canPrepareOrder({payment_status:"paid",fulfillment_status:"cancelled"}),false);
 assert.equal(canPrepareOrder({payment_status:"paid",fulfillment_status:"unfulfilled",status:"cancelled"}),false);
});

test("fulfillment API atomically refuses unpaid, failed, refunded and cancelled orders",async()=>{
 const route=await readFile(new URL("../server/routes/commerce.js",import.meta.url),"utf8");
 const a=route.indexOf('commerceRouter.patch("/orders/:id/fulfillment"');
 const b=route.indexOf('commerceRouter.post("/orders/:id/refunds"',a);
 assert.ok(a>=0&&b>a);
 const block=route.slice(a,b);
 for(const fragment of [
  "requirePermission(\"orders.fulfill\")",
  "where id=${req.params.id}::uuid and store_id=${req.storeId}::uuid",
  "payment_status in ('paid','partially_refunded')",
  "coalesce(fulfillment_status,'unfulfilled')<>'cancelled'",
  "status<>'cancelled'",
  "not in ('preparing','fulfilled','delivered')",
  "existing.length?409:404",
  "No puede prepararse ni enviarse"
 ])assert.ok(block.includes(fragment),fragment);
 const update=block.indexOf("update orders set fulfillment_status=");
 const guard=block.indexOf("payment_status in ('paid','partially_refunded')");
 const audit=block.indexOf("insert into order_events(");
 const notification=block.indexOf("enqueueOrderNotification(");
 assert.ok(update>=0&&guard>update&&audit>guard&&notification>audit);
});

test("merchant operations dashboard excludes unpaid orders from work pending",async()=>{
 const src=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 const start=src.indexOf('insightsRouter.get("/dashboard"');
 const end=src.indexOf('insightsRouter.get("/inventory"',start);
 const query=src.slice(start,end);
 assert.ok(query.includes("coalesce(fulfillment_status,'unfulfilled') in ('unfulfilled','preparing')"));
 assert.ok(query.includes("payment_status in ('paid','partially_refunded') and status<>'cancelled'"));
 const ui=await readFile(new URL("../src/platform/admin/OrdersManager.jsx",import.meta.url),"utf8");
 assert.ok(ui.includes("pending:items.filter(isOrderAwaitingFulfillment).length"));
 assert.ok(ui.includes('disabled={!canPrepareOrder(order)}>Preparando'));
 assert.ok(ui.includes('disabled={!canPrepareOrder(order)}>Enviado'));
 assert.ok(ui.includes('disabled={!canPrepareOrder(order)}>Entregado'));
 assert.ok(ui.includes("No prepares ni envíes este pedido"));
});
