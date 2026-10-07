alter table checkout_sessions
  add column if not exists recovery_consent boolean not null default false,
  add column if not exists recovery_notified_at timestamptz;

alter table notification_outbox
  drop constraint if exists notification_outbox_type_check;

alter table notification_outbox
  add constraint notification_outbox_type_check
  check(type in ('order.confirmed','order.shipped','order.delivered','refund.succeeded','checkout.abandoned'));

create or replace function bravoshop_enqueue_abandoned_checkout_notifications(p_limit integer default 20)
returns integer language plpgsql as $$
declare queued integer:=0;
begin
 with due as materialized (
  select c.id,c.store_id,c.customer_email,c.currency,c.total,c.token,s.name as store_name,s.slug as store_slug,
   coalesce((select sum(ci.quantity)::int from checkout_items ci where ci.checkout_id=c.id),0) as item_count
  from checkout_sessions c
  join stores s on s.id=c.store_id
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
    'store_name',d.store_name,
    'currency',d.currency,
    'total',d.total,
    'item_count',d.item_count,
    'recovery_url','https://' || d.store_slug || '.bravoshop.online/?recover=' || d.token::text
   ),
   'checkout.abandoned/' || d.id::text
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
