create table if not exists store_feature_entitlements(
id uuid primary key default gen_random_uuid(),
store_id uuid not null references stores(id) on delete cascade,
feature_key text not null,
source text not null default 'manual',
source_id uuid,
permanent boolean not null default false,
starts_at timestamptz not null default now(),
ends_at timestamptz,
limits jsonb not null default '{}'::jsonb,
metadata jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now(),
unique(store_id,feature_key,source,source_id)
);

create table if not exists access_codes(
id uuid primary key default gen_random_uuid(),
code text not null unique,
name text,
grant_type text not null default 'feature',
feature_key text,
plan_id uuid references plans(id) on delete set null,
permanent boolean not null default false,
starts_at timestamptz,
ends_at timestamptz,
max_uses integer,
uses integer not null default 0,
active boolean not null default true,
limits jsonb not null default '{}'::jsonb,
metadata jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now()
);

create table if not exists access_code_redemptions(
id uuid primary key default gen_random_uuid(),
access_code_id uuid not null references access_codes(id) on delete cascade,
store_id uuid not null references stores(id) on delete cascade,
redeemed_by uuid references app_users(id) on delete set null,
redeemed_at timestamptz not null default now(),
unique(access_code_id,store_id)
);

create index if not exists store_feature_entitlements_store_idx on store_feature_entitlements(store_id,feature_key);
create index if not exists access_codes_active_idx on access_codes(active);
