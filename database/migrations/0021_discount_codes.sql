create table if not exists discount_codes(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 code text not null,
 kind text not null check(kind in ('percent','fixed')),
 value numeric(12,2) not null check(value>0),
 minimum_amount numeric(12,2) not null default 0 check(minimum_amount>=0),
 active boolean not null default true,
 starts_at timestamptz,
 ends_at timestamptz,
 usage_limit integer check(usage_limit is null or usage_limit>0),
 usage_count integer not null default 0 check(usage_count>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(store_id,code)
);
create index if not exists discount_codes_store_active_idx on discount_codes(store_id,active,created_at desc);
alter table checkout_sessions add column if not exists discount_code text;
