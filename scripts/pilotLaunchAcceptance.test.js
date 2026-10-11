import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {evaluatePilotStore,evaluatePilotEvidence,commercialPilotSummary} from "../server/services/commercialLaunch.js";
import {summarizePilotStages} from "../src/platform/admin/pilotStages.js";

const platform={stripe:true,email:true,checkout:true};
const merchant={
 id:"00000000-0000-4000-8000-000000000001",name:"Piloto",slug:"piloto",
 sector:"retail",status:"active",plan_valid:true,design_ready:true,saleable_variants:2,
 published:true,legal_ready:true,shipping_ready:true,checkout_features_ready:true,connect_ready:true
};

test("a merchant with all 11 gates is not treated as commercially proven without a real payment",()=>{
 const merchantReady=evaluatePilotStore(merchant,platform);
 assert.equal(merchantReady.total,11);
 assert.equal(merchantReady.ready,true);
 const proof=evaluatePilotEvidence({});
 assert.equal(proof.verified,false);
 assert.equal(proof.order_id,null);
 assert.equal(proof.checks.length,4);
 assert.equal(proof.requires_manual_browser_test,true);
 assert.equal(proof.requires_manual_tenant_isolation_test,true);
 const stages=summarizePilotStages({...merchantReady,pilotEvidence:proof});
 assert.equal(stages.length,7);
 assert.equal(stages.slice(0,5).every(x=>x.ready),true);
 assert.equal(stages.slice(5).every(x=>!x.ready),true);
});

test("proof is restricted to the same confirmed Stripe order and never accepts ungrounded booleans",()=>{
 const id="00000000-0000-4000-8000-000000000010";
 const proof=evaluatePilotEvidence({
  pilot_paid_order_id:id,pilot_webhook_processed:true,
  pilot_email_sent:true,pilot_refund_success:true
 });
 assert.equal(proof.order_id,id);
 assert.equal(proof.verified,true);
 assert.equal(proof.checks.every(c=>c.ok),true);
 const withoutCharge=evaluatePilotEvidence({
  pilot_webhook_processed:true,pilot_email_sent:true,pilot_refund_success:true
 });
 assert.equal(withoutCharge.verified,false);
 assert.equal(withoutCharge.checks.every(c=>!c.ok),true);
 const merchantReady=evaluatePilotStore(merchant,platform);
 const stages=summarizePilotStages({...merchantReady,pilotEvidence:proof});
 assert.equal(stages[5].recordsComplete,true);
 assert.equal(stages[6].recordsComplete,true);
 assert.equal(stages[5].ready,false);
 assert.equal(stages[6].ready,false);
 assert.equal(commercialPilotSummary([merchantReady]).requiresManualCheckoutAndRefundProof,true);
});

test("seven stages keep incomplete technical gates separate from purchase evidence",()=>{
 const row=evaluatePilotStore({...merchant,shipping_ready:false,connect_ready:false},platform);
 const stages=summarizePilotStages({...row,pilotEvidence:evaluatePilotEvidence({})});
 assert.equal(stages[2].ready,false);
 assert.equal(stages[3].ready,false);
 assert.equal(stages[4].ready,true);
 assert.equal(stages[5].done,0);
});

test("superadmin readiness allows scoped search across all stores, without mutating store status",async()=>{
 const route=await readFile(new URL("../server/routes/admin.js",import.meta.url),"utf8");
 const a=route.indexOf('adminRouter.get("/launch/readiness"');
 const b=route.indexOf('adminRouter.get("/summary"',a);
 assert.ok(a>=0&&b>a);
 const s=route.slice(a,b);
 for(const expected of [
  'rawQuery.length>100',
  'const pattern="%"+search+"%"',
  's.name ilike ${pattern}',
  's.slug ilike ${pattern}',
  's.id::text=${search}',
  'left join lateral (',
  "o.payment_provider='stripe'",
  "o.paid_at is not null",
  "wh.payment_intent_id=pilot_order.provider_payment_id",
  "wh.event_type='payment_intent.succeeded'",
  "wh.status='processed'",
  "outbox.order_id=pilot_order.id",
  "outbox.status='sent'",
  "refund.order_id=pilot_order.id",
  "refund.status='succeeded'",
  'pilotEvidence:evaluatePilotEvidence(row)',
  'searchQuery:search,sampleLimit:120'
 ])assert.ok(s.includes(expected),expected);
 assert.ok(!s.includes('update stores set'));
 assert.ok(!s.includes('insert into orders'));
});

test("merchant search reaches server and UI never implies a real charge after green integration checks",async()=>{
 const service=await readFile(new URL("../src/platform/data/superAdminService.js",import.meta.url),"utf8");
 const ui=await readFile(new URL("../src/platform/admin/CommercialLaunch.jsx",import.meta.url),"utf8");
 assert.ok(service.includes('encodeURIComponent(query)'));
 assert.ok(ui.includes('getCommercialLaunchReadiness(query)'));
 assert.ok(ui.includes('summarizePilotStages(chosen)'));
 assert.ok(ui.includes('Falta validación externa'));
 assert.ok(ui.includes('pilot.order_id'));
 assert.ok(ui.includes('No hay tiendas que coincidan con esta búsqueda.'));
 assert.ok(ui.includes('const chosen=filtered.find(s=>s.id===selected)||filtered[0]'));
});
