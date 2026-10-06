create table if not exists plans(
id uuid primary key default gen_random_uuid(),
name text not null,
slug text not null unique,
status text not null default 'active',
monthly_price numeric(12,2),
annual_price numeric(12,2),
trial_days integer not null default 0,
is_public boolean not null default true,
metadata jsonb not null default '{}'::jsonb
);

create table if not exists plan_features(
plan_id uuid not null references plans(id) on delete cascade,
feature_key text not null,
enabled boolean not null default true,
limits jsonb not null default '{}'::jsonb,
primary key(plan_id,feature_key)
);

create table if not exists store_subscriptions(
store_id uuid primary key references stores(id) on delete cascade,
plan_id uuid references plans(id),
status text not null default 'trialing',
trial_ends_at timestamptz,
complimentary_until timestamptz,
complimentary_reason text,
provider_customer_id text,
provider_subscription_id text,
updated_at timestamptz not null default now()
);

create table if not exists promotions(
id uuid primary key default gen_random_uuid(),
code text not null unique,
kind text not null,
value numeric(12,2),
free_months integer,
starts_at timestamptz,
ends_at timestamptz,
max_uses integer,
uses integer not null default 0,
active boolean not null default true,
metadata jsonb not null default '{}'::jsonb
);

create table if not exists platform_feature_flags(
key text primary key,
enabled boolean not null default false,
rollout_percent integer not null default 0 check(rollout_percent between 0 and 100),
config jsonb not null default '{}'::jsonb,
updated_at timestamptz not null default now()
);

create table if not exists platform_controls(
key text primary key,
enabled boolean not null default true,
reason text,
updated_at timestamptz not null default now()
);

create table if not exists domains(
id uuid primary key default gen_random_uuid(),
store_id uuid not null references stores(id) on delete cascade,
hostname text not null unique,
kind text not null default 'subdomain',
status text not null default 'pending',
verified_at timestamptz
);

create table if not exists audit_log(
id bigint generated always as identity primary key,
actor_user_id uuid references app_users(id) on delete set null,
store_id uuid references stores(id) on delete set null,
action text not null,
resource_type text,
resource_id text,
details jsonb not null default '{}'::jsonb,
created_at timestamptz not null default now()
);

insert into platform_controls(key,enabled) values
('checkout',true),('ai_assistant',true),('ai_images',true),('registrations',true),
('store_creation',true),('emails',true),('automations',true)
on conflict do nothing;