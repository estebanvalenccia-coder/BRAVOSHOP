create table if not exists store_payment_accounts(
  store_id uuid primary key references stores(id) on delete cascade,
  provider text not null default 'stripe',
  provider_account_id text,
  status text not null default 'not_connected',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  default_currency text,
  country text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_payment_accounts_status_idx on store_payment_accounts(status);
