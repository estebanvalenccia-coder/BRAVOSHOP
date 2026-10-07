import{sql}from"../db/neon.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function subscriptionPeriodEnd(subscription){
 const values=(subscription?.items?.data||[]).map(x=>Number(x.current_period_end||0)).filter(x=>Number.isFinite(x)&&x>0);
 const epoch=values.length?Math.max(...values):0;
 return epoch>0?new Date(epoch*1000).toISOString():null;
}

export function subscriptionInterval(subscription){
 const interval=subscription?.items?.data?.[0]?.price?.recurring?.interval;
 return interval==="year"?"year":interval==="month"?"month":null;
}

export async function persistPlatformSubscription(subscription,{storeId=null,planId=null,lastInvoiceStatus=null}={}){
 const metadata=subscription?.metadata||{};
 let resolvedStore=UUID.test(String(metadata.bravoshop_billing_store_id||""))
  ?metadata.bravoshop_billing_store_id
  :UUID.test(String(metadata.bravoshop_store_id||""))?metadata.bravoshop_store_id:storeId;
 let resolvedPlan=UUID.test(String(metadata.bravoshop_plan_id||""))?metadata.bravoshop_plan_id:planId;
 const customer=typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id||null;
 const priceId=subscription?.items?.data?.[0]?.price?.id||null;

 if(!resolvedStore){
  const rows=subscription?.id
   ?await sql`select store_id,plan_id from store_subscriptions where provider_subscription_id=${subscription.id} limit 1`
   :[];
  if(rows.length){resolvedStore=rows[0].store_id;resolvedPlan=resolvedPlan||rows[0].plan_id}
 }
 if(!resolvedStore&&customer){
  const rows=await sql`select store_id,plan_id from store_subscriptions where provider_customer_id=${customer} limit 1`;
  if(rows.length){resolvedStore=rows[0].store_id;resolvedPlan=resolvedPlan||rows[0].plan_id}
 }
 if(!resolvedStore)return null;

 if(!resolvedPlan&&priceId){
  const rows=await sql`select id from plans where provider_monthly_price_id=${priceId} or provider_annual_price_id=${priceId} limit 1`;
  resolvedPlan=rows[0]?.id||null;
 }
 if(!resolvedPlan){
  const rows=await sql`select plan_id from store_subscriptions where store_id=${resolvedStore}::uuid limit 1`;
  resolvedPlan=rows[0]?.plan_id||null;
 }

 const status=String(subscription.status||"incomplete");
 const periodEnd=subscriptionPeriodEnd(subscription);
 const interval=subscriptionInterval(subscription);
 await sql`
  insert into store_subscriptions(
   store_id,plan_id,status,provider_customer_id,provider_subscription_id,provider_price_id,
   billing_interval,current_period_end,cancel_at_period_end,last_invoice_status,updated_at
  ) values(
   ${resolvedStore}::uuid,${resolvedPlan}::uuid,${status},${customer},${subscription.id||null},${priceId},
   ${interval},${periodEnd},${Boolean(subscription.cancel_at_period_end)},${lastInvoiceStatus},now()
  )
  on conflict(store_id) do update set
   plan_id=coalesce(excluded.plan_id,store_subscriptions.plan_id),
   status=excluded.status,
   provider_customer_id=coalesce(excluded.provider_customer_id,store_subscriptions.provider_customer_id),
   provider_subscription_id=coalesce(excluded.provider_subscription_id,store_subscriptions.provider_subscription_id),
   provider_price_id=coalesce(excluded.provider_price_id,store_subscriptions.provider_price_id),
   billing_interval=coalesce(excluded.billing_interval,store_subscriptions.billing_interval),
   current_period_end=excluded.current_period_end,
   cancel_at_period_end=excluded.cancel_at_period_end,
   last_invoice_status=coalesce(excluded.last_invoice_status,store_subscriptions.last_invoice_status),
   updated_at=now()`;

 if(["active","trialing"].includes(status)){
  await sql`update stores set status='active',updated_at=now() where id=${resolvedStore}::uuid and status in ('trial','active','unpaid')`;
 }else if(["past_due","unpaid","canceled","incomplete_expired","paused"].includes(status)){
  await sql`update stores set status='unpaid',updated_at=now() where id=${resolvedStore}::uuid and status in ('trial','active','unpaid')`;
 }
 return resolvedStore;
}
