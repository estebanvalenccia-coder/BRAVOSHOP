create or replace function bravoshop_enqueue_abandoned_checkout_notifications(p_limit integer default 20)
returns integer language plpgsql as $$
declare queued integer:=0;
begin
 with due as materialized (
  select c.id,c.store_id,c.customer_email,c.currency,c.total,c.token,s.name as store_name,
   coalesce(d.hostname,s.slug||'.bravoshop.online') as public_host,
   coalesce((select sum(ci.quantity)::int from checkout_items ci where ci.checkout_id=c.id),0) as item_count
  from checkout_sessions c
  join stores s on s.id=c.store_id
  left join lateral (
   select hostname from domains
   where store_id=s.id and kind='custom' and status='verified' and infrastructure_status='active'
   order by is_primary desc,created_at
   limit 1
  ) d on true
  where c.completed_order_id is null
   and c.recovery_consent=true
   and c.recovery_notified_at is null
   and c.customer_email is not null
   and c.expires_at<=now()-interval '15 minutes'
   and c.status in ('open','payment_pending','payment_failed','expired')
  order by c.expires_at
  for update of c skip locked
  limit greatest(1,least(coalesce(p_limit,20),100))
 ),
 inserted as (
  insert into notification_outbox(store_id,order_id,type,recipient,payload,idempotency_key)
  select d.store_id,null,'checkout.abandoned',d.customer_email,
   jsonb_build_object(
    'store_name',d.store_name,'currency',d.currency,'total',d.total,'item_count',d.item_count,
    'recovery_url','https://'||d.public_host||'/?recover='||d.token::text
   ),
   'checkout.abandoned/'||d.id::text
  from due d
  on conflict(idempotency_key) do nothing
  returning id
 ),
 marked as (
  update checkout_sessions c
  set recovery_notified_at=now(),updated_at=now()
  from due d
  where c.id=d.id
  returning c.id
 )
 select count(*)::int into queued from marked;
 return queued;
end $$;
