-- Consolidated billing contract after both 0049 billing migrations.
alter table plans add column if not exists currency text not null default 'EUR';
alter table plans add column if not exists provider_product_id text;
alter table plans add column if not exists provider_monthly_price_id text;
alter table plans add column if not exists provider_annual_price_id text;

alter table store_subscriptions add column if not exists billing_interval text;
alter table store_subscriptions add column if not exists provider_price_id text;
alter table store_subscriptions add column if not exists provider_checkout_session_id text;
alter table store_subscriptions add column if not exists current_period_end timestamptz;
alter table store_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table store_subscriptions add column if not exists last_invoice_status text;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='store_subscriptions_billing_interval_check') then
  alter table store_subscriptions add constraint store_subscriptions_billing_interval_check
   check(billing_interval is null or billing_interval in ('month','year'));
 end if;
end $$;

create unique index if not exists plans_provider_monthly_price_uidx
 on plans(provider_monthly_price_id) where provider_monthly_price_id is not null;
create unique index if not exists plans_provider_annual_price_uidx
 on plans(provider_annual_price_id) where provider_annual_price_id is not null;
create unique index if not exists store_subscriptions_provider_subscription_uidx
 on store_subscriptions(provider_subscription_id) where provider_subscription_id is not null;

-- Every store participates in the billing model. Legacy stores receive the Basic plan
-- without inventing an expiry when the plan has no trial duration configured.
insert into store_subscriptions(store_id,plan_id,status,trial_ends_at,updated_at)
select s.id,p.id,'trialing',
 case when p.trial_days>0 then now()+make_interval(days=>p.trial_days) else null end,
 now()
from stores s
cross join lateral (select id,trial_days from plans where slug='basic' and status='active' limit 1) p
where not exists(select 1 from store_subscriptions ss where ss.store_id=s.id)
on conflict(store_id) do nothing;
