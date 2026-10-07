import{sql}from"../db/neon.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function subscriptionPeriodEnd(subscription){
 const values=(subscription?.items?.data||[]).map(x=>Number(x.current_period_end||0)).filter(Number.isFinite);
 const epoch=values.length?Math.max(...values):0;
 return epoch>0?new Date(epoch*1000).toISOString():null;
}

export function subscriptionInterval(subscription){
 const interval=subscription?.items?.data?.[0]?.price?.recurring?.interval;
 return interval==="year"?"year":interval==="month"?"month":null;
}

export async function persistPlatformSubscription(subscription,{storeId=null,planId=null}={}){
 const metadata=subscription?.metadata||{};
 const resolvedStore=UUID.test(String(metadata.bravoshop_store_id||""))?metadata.bravoshop_store_id:storeId;
 const resolvedPlan=UUID.test(String(metadata.bravoshop_plan_id||""))?metadata.bravoshop_plan_id:planId;
 if(!resolvedStore){
  const rows=await sql`select store_id,plan_id from store_subscriptions where provider_subscription_id=${subscription.id} or provider_customer_id=${String(subscription.customer||"")} limit 1`;
  if(!rows.length)return null;
  return persistPlatformSubscription(subscription,{storeId:rows[0].store_id,planId:resolvedPlan||rows[0].plan_id});
 }
 let finalPlan=resolvedPlan;
 if(!finalPlan){
  const rows=await sql`select plan_id from store_subscriptions where store_id=${resolvedStore}::uuid limit 1`;
  finalPlan=rows[0]?.plan_id||null;
 }
 const status=String(subscription.status||"incomplete");
 const periodEnd=subscriptionPeriodEnd(subscription);
 const interval=subscriptionInterval(subscription);
 const customer=typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id||null;
 await sql`
  insert into store_subscriptions(
   store_id,plan_id,status,provider_customer_id,provider_subscription_id,billing_interval,current_period_end,cancel_at_period_end,updated_at
  ) values(
   ${resolvedStore}::uuid,${finalPlan}::uuid,${status},${customer},${subscription.id},${interval},${periodEnd},${Boolean(subscription.cancel_at_period_end)},now()
  )
  on conflict(store_id) do update set
   plan_id=coalesce(excluded.plan_id,store_subscriptions.plan_id),
   status=excluded.status,
   provider_customer_id=coalesce(excluded.provider_customer_id,store_subscriptions.provider_customer_id),
   provider_subscription_id=excluded.provider_subscription_id,
   billing_interval=excluded.billing_interval,
   current_period_end=excluded.current_period_end,
   cancel_at_period_end=excluded.cancel_at_period_end,
   updated_at=now()`;
 return resolvedStore;
}
