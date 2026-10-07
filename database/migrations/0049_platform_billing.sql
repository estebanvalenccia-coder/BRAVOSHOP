-- Stripe Billing lifecycle for BravoShop merchant subscriptions.
alter table store_subscriptions add column if not exists billing_interval text;
alter table store_subscriptions add column if not exists current_period_end timestamptz;
alter table store_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table store_subscriptions add column if not exists provider_checkout_session_id text;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='store_subscriptions_billing_interval_check') then
  alter table store_subscriptions add constraint store_subscriptions_billing_interval_check
   check(billing_interval is null or billing_interval in ('month','year'));
 end if;
end $$;

create unique index if not exists store_subscriptions_provider_subscription_uidx
 on store_subscriptions(provider_subscription_id)
 where provider_subscription_id is not null;

create index if not exists store_subscriptions_provider_customer_idx
 on store_subscriptions(provider_customer_id)
 where provider_customer_id is not null;
