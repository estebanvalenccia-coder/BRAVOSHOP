create extension if not exists pgcrypto;

create table if not exists app_users(
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text,
  role text not null default 'merchant',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists stores(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null unique,
  sector text,
  status text not null default 'trial',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists store_members(
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key(store_id,user_id)
);

create index if not exists store_members_user_idx on store_members(user_id);

create table if not exists store_settings(
  store_id uuid primary key references stores(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
);

create table if not exists store_theme(
  store_id uuid primary key references stores(id) on delete cascade,
  theme jsonb not null default '{}'::jsonb
);

create table if not exists store_features(
  store_id uuid not null references stores(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  primary key(store_id,feature_key)
);
