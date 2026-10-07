-- Merchant-facing BravoShop SaaS subscription billing.
alter table plans add column if not exists currency text not null default 'EUR';
alter table plans add column if not exists provider_product_id text;
alter table plans add column if not exists provider_monthly_price_id text;
alter table plans add column if not exists provider_annual_price_id text;

alter table store_subscriptions add column if not exists billing_interval text check(billing_interval is null or billing_interval in ('month','year'));
alter table store_subscriptions add column if not exists provider_price_id text;
alter table store_subscriptions add column if not exists provider_checkout_session_id text;
alter table store_subscriptions add column if not exists current_period_end timestamptz;
alter table store_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table store_subscriptions add column if not exists last_invoice_status text;

create unique index if not exists store_subscriptions_provider_subscription_uidx
 on store_subscriptions(provider_subscription_id) where provider_subscription_id is not null;
create unique index if not exists store_subscriptions_provider_customer_uidx
 on store_subscriptions(provider_customer_id) where provider_customer_id is not null;
create index if not exists store_subscriptions_status_idx on store_subscriptions(status,updated_at desc);
