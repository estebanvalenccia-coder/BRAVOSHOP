import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("30-day products, statuses and recurring customers share paid-only cohort",async()=>{
 const src=await readFile(new URL("../server/routes/insights.js",import.meta.url),"utf8");
 const start=src.indexOf('insightsRouter.get("/analytics"');
 const end=src.indexOf('insightsRouter.get("/inventory/movements"',start);
 const block=src.slice(start,end);
 assert.ok(start>=0&&end>start);
 const queries=block.match(/sql`[^]*?`/g)||[];
 assert.equal(queries.length,4);
 for(const query of queries){
  assert.ok(query.includes("payment_status in ('paid','partially_refunded')"),"must use paid-only status");
  assert.ok(query.includes("current_date-29"),"must exclude old orders");
  assert.ok(query.includes("current_date+interval '1 day'"),"must exclude future orders");
 }
 assert.ok(queries[2].includes("group by fulfillment_status"));
 assert.ok(queries[3].includes("group by lower(btrim(customer_email)) having count(*)>1"));
 assert.ok(queries[3].includes("btrim(customer_email)<>''"));
 assert.ok(queries[1].includes("group by oi.title"));
 assert.ok(block.includes("repeat_customers:repeatCustomers[0].value"));
});
