-- Tenant context, verified custom domains, and private upload-intent tracking.
alter table store_members
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

alter table audit_log
  add column if not exists actor_type text not null default 'user',
  add column if not exists user_agent text;

create index if not exists store_members_active_user_idx
  on store_members(user_id, store_id) where status='active';

create unique index if not exists stores_slug_ci_uidx
  on stores(lower(slug));

create unique index if not exists products_store_slug_ci_uidx
  on products(store_id, lower(slug));

create unique index if not exists categories_store_slug_ci_uidx
  on categories(store_id, lower(slug));

alter table domains
  add column if not exists verification_token_hash text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists is_primary boolean not null default false;

create unique index if not exists domains_one_primary_per_store_uidx
  on domains(store_id) where is_primary=true;

alter table stripe_webhook_events
  add column if not exists account_id text,
  add column if not exists store_id uuid references stores(id) on delete set null,
  add column if not exists status text not null default 'processed',
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists error text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists media_upload_intents(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  created_by uuid references app_users(id) on delete set null,
  object_path text not null unique,
  public_url text,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes>0),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists media_upload_intents_store_expiry_idx
  on media_upload_intents(store_id, expires_at);

create index if not exists orders_store_status_idx
  on orders(store_id, status, created_at desc);
