-- Durable transactional email outbox.
create table if not exists notification_outbox(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 order_id uuid references orders(id) on delete cascade,
 type text not null check(type in ('order.confirmed','order.shipped','order.delivered','refund.succeeded')),
 recipient text not null,
 payload jsonb not null default '{}'::jsonb,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default now(),
 locked_at timestamptz,
 provider_message_id text,
 last_error text,
 idempotency_key text not null unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 sent_at timestamptz
);
create index if not exists notification_outbox_pending_idx
 on notification_outbox(status,next_attempt_at,created_at)
 where status in ('pending','sending');

create or replace function bravoshop_claim_notification_batch(p_limit integer default 10)
returns setof notification_outbox language plpgsql as $$
begin
 return query
 with picked as (
  select id from notification_outbox
  where (
    status='pending'
    or (status='sending' and locked_at<now()-interval '5 minutes')
  ) and next_attempt_at<=now()
  order by created_at
  for update skip locked
  limit greatest(1,least(coalesce(p_limit,10),50))
 )
 update notification_outbox n
 set status='sending',attempts=n.attempts+1,locked_at=now(),updated_at=now()
 from picked
 where n.id=picked.id
 returning n.*;
end $$;
