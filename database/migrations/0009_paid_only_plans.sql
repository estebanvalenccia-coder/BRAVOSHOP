-- Paid-only commercial model: Basic and Premium. No public Free tier.
insert into plans(name,slug,status,is_public,metadata)
values ('Basic','basic','active',true,'{"tier":1,"paid":true}'::jsonb)
on conflict (slug) do update set name=excluded.name,status='active',is_public=true,metadata=plans.metadata||excluded.metadata;

-- Migrate any legacy Free subscriptions before removing the obsolete plan.
update store_subscriptions ss
set plan_id=(select id from plans where slug='basic' limit 1),updated_at=now()
where plan_id in (select id from plans where slug='free');

delete from plan_features where plan_id in (select id from plans where slug='free');
delete from plans where slug='free';

-- Access codes may grant a complete paid plan as an owner-controlled complimentary exception.
alter table access_codes add column if not exists complimentary_reason text;
alter table access_codes add column if not exists complimentary_days integer;
