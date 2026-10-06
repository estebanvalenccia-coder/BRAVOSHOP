create table if not exists products(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  price numeric(12,2) not null default 0,
  status text not null default 'draft',
  product_type text,
  vendor text,
  metadata jsonb not null default '{}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id,slug)
);
create index if not exists products_store_status_idx on products(store_id,status);

create table if not exists categories(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  parent_id uuid references categories(id) on delete set null,
  position integer not null default 0,
  active boolean not null default true,
  unique(store_id,slug)
);

create table if not exists product_categories(
  product_id uuid not null references products(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key(product_id,category_id)
);

create table if not exists product_variants(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text,
  title text not null default 'Default',
  price numeric(12,2),
  compare_at_price numeric(12,2),
  options jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists inventory_levels(
  variant_id uuid primary key references product_variants(id) on delete cascade,
  quantity integer not null default 0 check(quantity>=0),
  reserved integer not null default 0 check(reserved>=0),
  track_inventory boolean not null default true,
  allow_backorder boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists customers(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  email text,
  name text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists customers_store_email_idx on customers(store_id,email);

create table if not exists orders(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  fulfillment_status text not null default 'unfulfilled',
  currency text not null default 'EUR',
  subtotal numeric(12,2) not null default 0,
  shipping_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  customer_email text,
  shipping_address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_store_created_idx on orders(store_id,created_at desc);

create table if not exists order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  title text not null,
  sku text,
  quantity integer not null check(quantity>0),
  unit_price numeric(12,2) not null check(unit_price>=0),
  total numeric(12,2) not null check(total>=0),
  snapshot jsonb not null default '{}'::jsonb
);
