create table if not exists stripe_webhook_claims(
 event_id text primary key,
 event_type text not null,
 account_id text,
 status text not null default 'processing' check(status in ('processing','processed','failed')),
 attempts integer not null default 1 check(attempts>0),
 locked_at timestamptz not null default now(),
 processed_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists stripe_webhook_claims_status_locked_idx
 on stripe_webhook_claims(status,locked_at);

create or replace function bravoshop_claim_stripe_webhook(
 p_event_id text,
 p_event_type text,
 p_account_id text default null
)
returns text language plpgsql as $$
declare c stripe_webhook_claims%rowtype;
begin
 select * into c from stripe_webhook_claims where event_id=p_event_id for update;
 if not found then
  insert into stripe_webhook_claims(event_id,event_type,account_id,status,attempts,locked_at)
  values(p_event_id,p_event_type,p_account_id,'processing',1,now());
  return 'claimed';
 end if;

 if c.status='processed' then return 'processed'; end if;
 if c.status='processing' and c.locked_at>now()-interval '5 minutes' then return 'busy'; end if;

 update stripe_webhook_claims
 set event_type=p_event_type,
     account_id=coalesce(p_account_id,account_id),
     status='processing',
     attempts=attempts+1,
     locked_at=now(),
     last_error=null,
     updated_at=now()
 where event_id=p_event_id;
 return 'claimed';
end $$;

create or replace function bravoshop_finish_stripe_webhook_claim(
 p_event_id text,
 p_success boolean,
 p_error text default null
)
returns boolean language plpgsql as $$
begin
 update stripe_webhook_claims
 set status=case when p_success then 'processed' else 'failed' end,
     processed_at=case when p_success then now() else processed_at end,
     last_error=case when p_success then null else left(coalesce(p_error,'Webhook processing failed'),1000) end,
     locked_at=now(),
     updated_at=now()
 where event_id=p_event_id;
 return found;
end $$;
