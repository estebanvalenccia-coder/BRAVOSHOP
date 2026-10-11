import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isCurrentBillingPlan,billingPlanAction,billingNextDate,billingPlanHeading,billingRenewalLabel} from "../src/platform/admin/billingPlanState.js";

const pending={plan_slug:"premium",billing_interval:"month",status:"checkout_pending",
 provider_subscription_id:null,trial_ends_at:"2026-10-24T00:00:00Z"};
const paid={...pending,status:"active",provider_subscription_id:"sub_verified",current_period_end:"2026-11-11T00:00:00Z"};

test("an abandoned Stripe checkout is never shown as an active plan and can be retried",()=>{
 assert.equal(isCurrentBillingPlan(pending,"premium","month"),false);
 assert.equal(billingPlanAction(pending,"premium","month"),"Continuar pago pendiente");
 assert.equal(billingPlanAction(pending,"premium","year"),"Contratar plan");
 assert.equal(billingPlanAction(pending,"basic","month"),"Contratar plan");
 assert.equal(billingPlanHeading(pending),"PLAN PENDIENTE DE PAGO");
 assert.equal(billingRenewalLabel(pending),"Pago pendiente");
});

test("only an actual live Stripe subscription locks the selected plan",()=>{
 assert.equal(isCurrentBillingPlan(paid,"premium","month"),true);
 assert.equal(billingPlanAction(paid,"premium","month"),"Plan actual");
 assert.equal(isCurrentBillingPlan(paid,"basic","month"),false);
 assert.equal(billingPlanAction(paid,"basic","month"),"Cambiar a este plan");
 assert.equal(isCurrentBillingPlan({...paid,status:"unpaid"},"premium","month"),false);
 assert.equal(isCurrentBillingPlan({...paid,status:"active",cancel_at_period_end:true},"premium","month"),false);
 assert.equal(isCurrentBillingPlan({...paid,status:"trialing"},"premium","month"),true);
});

test("local free trials display an expiry, not an invented renewal date",()=>{
 const local={status:"trialing",plan_slug:"basic",billing_interval:null,trial_ends_at:"2026-10-25T10:00:00Z",provider_subscription_id:null};
 assert.deepEqual(billingNextDate(local),{label:"Fin del periodo de prueba",value:local.trial_ends_at});
 assert.deepEqual(billingNextDate(pending),{label:"Fin del periodo de prueba",value:pending.trial_ends_at});
 assert.equal(billingPlanHeading(local),"PLAN EN PRUEBA");
 assert.equal(billingRenewalLabel(local),"Prueba sin cobro");
 assert.deepEqual(billingNextDate(paid),{label:"Próxima fecha",value:paid.current_period_end});
});

test("expired subscriptions and cancelled accounts are never marketed as renewing",()=>{
 for(const status of ["expired","unpaid","canceled","incomplete_expired","past_due","paused"]){
  assert.equal(billingRenewalLabel({...paid,status}),"No activa",status);
  assert.equal(isCurrentBillingPlan({...paid,status},"premium","month"),false,status);
 }
 assert.equal(billingRenewalLabel({...paid,cancel_at_period_end:true}),"Se cancelará");
 assert.equal(billingRenewalLabel({...paid,provider_subscription_id:null,complimentary_reason:"Prueba autorizada"}),"Acceso especial");
});

test("merchant billing screen wires retry action and real trial-state labels",async()=>{
 const src=await readFile(new URL("../src/platform/admin/MerchantAdmin.jsx",import.meta.url),"utf8");
 const a=src.indexOf("function PlatformBilling(");
 const b=src.indexOf("function Payments(",a);
 const ui=src.slice(a,b);
 assert.ok(ui.includes("selected=isCurrentBillingPlan(current,p.slug,interval)"));
 assert.ok(ui.includes("billingPlanAction(current,p.slug,interval)"));
 assert.ok(ui.includes("billingNextDate(current)"));
 assert.ok(ui.includes("billingPlanHeading(current)"));
 assert.ok(ui.includes("billingRenewalLabel(current)"));
 assert.ok(ui.includes("startBillingCheckout(store.id,plan.slug,interval"));
 assert.ok(!ui.includes('selected=current?.plan_slug===p.slug&&current?.billing_interval===interval'));
});
