alter table checkout_sessions add column if not exists payment_provider text;
alter table checkout_sessions add column if not exists provider_payment_id text;
alter table checkout_sessions add column if not exists paid_at timestamptz;
alter table checkout_sessions add column if not exists completed_order_id uuid references orders(id) on delete set null;
create unique index if not exists checkout_sessions_provider_payment_idx on checkout_sessions(provider_payment_id) where provider_payment_id is not null;

alter table store_payment_accounts add column if not exists provider_account_id text;
create unique index if not exists store_payment_provider_account_idx on store_payment_accounts(provider,provider_account_id) where provider_account_id is not null;
