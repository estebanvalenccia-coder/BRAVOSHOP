create table if not exists checkout_sessions(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'open',
  currency text not null default 'EUR',
  subtotal numeric(12,2) not null default 0,
  shipping_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  customer_email text,
  shipping_address jsonb not null default '{}'::jsonb,
  payment_provider text,
  provider_session_id text,
  expires_at timestamptz not null default (now()+interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checkout_store_created_idx on checkout_sessions(store_id,created_at desc);
create index if not exists checkout_token_idx on checkout_sessions(token);

create table if not exists checkout_items(
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references checkout_sessions(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null,
  title text not null,
  sku text,
  quantity integer not null check(quantity>0),
  unit_price numeric(12,2) not null check(unit_price>=0),
  total numeric(12,2) not null check(total>=0),
  snapshot jsonb not null default '{}'::jsonb
);
