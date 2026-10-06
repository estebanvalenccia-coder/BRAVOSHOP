create table if not exists shipping_zones(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 name text not null,
 countries text[] not null default '{}',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists shipping_rates(
 id uuid primary key default gen_random_uuid(),
 zone_id uuid not null references shipping_zones(id) on delete cascade,
 name text not null,
 price numeric(12,2) not null default 0 check(price>=0),
 free_over numeric(12,2),
 min_days integer,
 max_days integer,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index if not exists shipping_zones_store_idx on shipping_zones(store_id);
create table if not exists store_tax_settings(
 store_id uuid primary key references stores(id) on delete cascade,
 enabled boolean not null default false,
 prices_include_tax boolean not null default true,
 default_rate numeric(6,3) not null default 0 check(default_rate>=0 and default_rate<=100),
 updated_at timestamptz not null default now()
);
