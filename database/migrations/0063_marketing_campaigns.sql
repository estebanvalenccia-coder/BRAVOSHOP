create table if not exists marketing_campaigns(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 name text not null,
 subject text not null,
 heading text not null,
 body_text text not null,
 button_label text,
 button_url text,
 status text not null default 'draft' check(status in ('draft','queued','sending','sent','canceled')),
 recipient_count integer not null default 0 check(recipient_count>=0),
 sent_count integer not null default 0 check(sent_count>=0),
 failed_count integer not null default 0 check(failed_count>=0),
 created_by uuid references app_users(id) on delete set null,
 queued_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists marketing_campaign_deliveries(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
 store_id uuid not null references stores(id) on delete cascade,
 subscriber_id uuid references newsletter_subscribers(id) on delete set null,
 recipient text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default now(),
 locked_at timestamptz,
 provider_message_id text,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(campaign_id,subscriber_id)
);

create index if not exists marketing_campaigns_store_created_idx
 on marketing_campaigns(store_id,created_at desc);
create index if not exists marketing_campaign_deliveries_pending_idx
 on marketing_campaign_deliveries(status,next_attempt_at,created_at)
 where status in ('pending','sending');

create or replace function bravoshop_queue_marketing_campaign(p_campaign_id uuid,p_store_id uuid)
returns integer language plpgsql as $$
declare c marketing_campaigns%rowtype; queued integer:=0;
begin
 select * into c from marketing_campaigns
 where id=p_campaign_id and store_id=p_store_id
 for update;
 if not found or c.status<>'draft' then return 0; end if;

 insert into marketing_campaign_deliveries(campaign_id,store_id,subscriber_id,recipient)
 select c.id,c.store_id,n.id,n.email
 from newsletter_subscribers n
 where n.store_id=c.store_id and n.status='active'
 on conflict(campaign_id,subscriber_id) do nothing;

 get diagnostics queued = row_count;
 if queued<=0 then return 0; end if;

 update marketing_campaigns
 set status='queued',recipient_count=queued,queued_at=now(),updated_at=now()
 where id=c.id;
 return queued;
end $$;

create or replace function bravoshop_claim_marketing_delivery_batch(p_limit integer default 10)
returns setof marketing_campaign_deliveries language plpgsql as $$
begin
 return query
 with picked as (
  select d.id
  from marketing_campaign_deliveries d
  join marketing_campaigns c on c.id=d.campaign_id
  where c.status in ('queued','sending')
   and (
    d.status='pending'
    or (d.status='sending' and d.locked_at<now()-interval '5 minutes')
   )
   and d.next_attempt_at<=now()
  order by d.created_at
  for update of d skip locked
  limit greatest(1,least(coalesce(p_limit,10),50))
 ),
 claimed as (
  update marketing_campaign_deliveries d
  set status='sending',attempts=d.attempts+1,locked_at=now(),updated_at=now()
  from picked
  where d.id=picked.id
  returning d.*
 )
 select * from claimed;

 update marketing_campaigns c
 set status='sending',updated_at=now()
 where c.status='queued'
  and exists(select 1 from marketing_campaign_deliveries d where d.campaign_id=c.id and d.status='sending');
end $$;

create or replace function bravoshop_refresh_marketing_campaign(p_campaign_id uuid)
returns void language plpgsql as $$
declare pending_count integer; sent_count_v integer; failed_count_v integer; total_count integer;
begin
 select count(*)::int,
        count(*) filter(where status in ('pending','sending'))::int,
        count(*) filter(where status='sent')::int,
        count(*) filter(where status='failed')::int
 into total_count,pending_count,sent_count_v,failed_count_v
 from marketing_campaign_deliveries
 where campaign_id=p_campaign_id;

 update marketing_campaigns
 set recipient_count=total_count,
     sent_count=sent_count_v,
     failed_count=failed_count_v,
     status=case when status='canceled' then status when pending_count=0 then 'sent' else 'sending' end,
     completed_at=case when pending_count=0 then coalesce(completed_at,now()) else null end,
     updated_at=now()
 where id=p_campaign_id;
end $$;
