// A Stripe Checkout session is not a paid subscription. Keep its plan
// selectable so merchants can retry an abandoned or cancelled checkout.
export function isCurrentBillingPlan(current,planSlug,interval){
 return Boolean(current?.provider_subscription_id
  && ["active","trialing"].includes(current.status)
  && current.plan_slug===planSlug
  && current.billing_interval===interval
  && current.cancel_at_period_end!==true);
}

export function billingPlanAction(current,planSlug,interval){
 if(isCurrentBillingPlan(current,planSlug,interval))return "Plan actual";
 if(current?.status==="checkout_pending"
  && current?.plan_slug===planSlug
  && current?.billing_interval===interval)return "Continuar pago pendiente";
 return current?.provider_subscription_id?"Cambiar a este plan":"Contratar plan";
}

export function billingNextDate(current){
 const localTrial=Boolean(!current?.provider_subscription_id
  && ["trialing","checkout_pending"].includes(current?.status)
  && current?.trial_ends_at);
 return {label:localTrial?"Fin del periodo de prueba":"Próxima fecha",
  value:localTrial?current.trial_ends_at:current?.current_period_end||null};
}

export function billingPlanHeading(current){
 if(current?.status==="checkout_pending")return "PLAN PENDIENTE DE PAGO";
 if(current?.status==="trialing"&&!current?.provider_subscription_id)return "PLAN EN PRUEBA";
 if(["expired","unpaid","incomplete","incomplete_expired","canceled"].includes(current?.status))return "PLAN SIN ACCESO";
 return "PLAN ACTUAL";
}

export function billingRenewalLabel(current){
 if(current?.status==="checkout_pending")return "Pago pendiente";
 if(current?.status==="trialing"&&!current?.provider_subscription_id)return "Prueba sin cobro";
 if(["expired","unpaid","incomplete","incomplete_expired","canceled","past_due","paused"].includes(current?.status))return "No activa";
 if(current?.cancel_at_period_end)return "Se cancelará";
 return current?.provider_subscription_id?"Activa":"Acceso especial";
}
