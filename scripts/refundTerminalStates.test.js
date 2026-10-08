import test from "node:test";
import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";
import{splitSqlStatements}from"./sqlStatements.js";

test("terminal refund state migration remains a single atomic Postgres function",async()=>{
 const src=await readFile(new URL("../database/migrations/0071_refund_terminal_states.sql",import.meta.url),"utf8");
 assert.equal(splitSqlStatements(src).length,1);
 assert.ok(src.includes("create or replace function bravoshop_update_refund_for_store("));
});

test("refund transitions are tenant-scoped and locked before any state mutation",async()=>{
 const sql=await readFile(new URL("../database/migrations/0071_refund_terminal_states.sql",import.meta.url),"utf8");
 for(const guard of [
  "p_new_status not in ('pending','succeeded','failed')",
  "where r.id=p_refund_id and o.store_id=p_store_id",
  "for update of r",
  "where id=refund_row.order_id and store_id=p_store_id for update",
  "refund_row.provider_refund_id<>p_provider_refund_id",
  "refund_row.status in ('succeeded','failed')",
  "return refund_row.order_id"
 ])assert.ok(sql.includes(guard),guard);
 const provider=sql.indexOf("refund_row.provider_refund_id<>p_provider_refund_id");
 const terminal=sql.indexOf("refund_row.status in ('succeeded','failed')");
 const mutation=sql.indexOf("  update order_refunds\n  set provider_refund_id");
 assert.ok(provider>=0&&terminal>provider&&mutation>terminal,
  "Validate Stripe refund ID, then terminal status, then mutate");
});

test("successful refunds account for the amount only on the initial transition",async()=>{
 const sql=await readFile(new URL("../database/migrations/0071_refund_terminal_states.sql",import.meta.url),"utf8");
 const terminal=sql.indexOf("refund_row.status in ('succeeded','failed')");
 const addRefund=sql.indexOf("refunded_total=refunded_total+refund_row.amount");
 const releaseReservation=sql.indexOf("refund_reserved_total=greatest(0,refund_reserved_total-refund_row.amount)");
 assert.ok(terminal>=0&&addRefund>terminal&&releaseReservation>terminal);
 assert.ok(sql.includes("refund_row.status<>'failed'"));
});

test("readiness requires terminal state migration",async()=>{
 const src=await readFile(new URL("../server/index.js",import.meta.url),"utf8");
 assert.ok(src.includes("name='0071_refund_terminal_states.sql'"));
});
