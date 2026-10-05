-- BravoShop commerce core
create table categories(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  parent_id uuid references categories(id) on delete set null,
  media_id uuid references media_assets(id) on delete set null,
  position integer not null default 0,
  active boolean not null default true,
  unique(store_id,slug)
);
create table product_categories(
  product_id uuid not null references products(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key(product_id,category_id)
);
create table product_variants(
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
create unique index product_variants_sku_unique_per_product on product_variants(product_id,sku) where sku is not null;
create table inventory_levels(
  variant_id uuid primary key references product_variants(id) on delete cascade,
  quantity integer not null default 0,
  reserved integer not null default 0,
  track_inventory boolean not null default true,
  allow_backorder boolean not null default false,
  updated_at timestamptz not null default now(),
  check(quantity>=0 and reserved>=0)
);
create table order_items(
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
alter table orders add column if not exists currency text not null default 'EUR';
alter table orders add column if not exists subtotal numeric(12,2) not null default 0;
alter table orders add column if not exists shipping_total numeric(12,2) not null default 0;
alter table orders add column if not exists tax_total numeric(12,2) not null default 0;
alter table orders add column if not exists discount_total numeric(12,2) not null default 0;
alter table orders add column if not exists payment_status text not null default 'unpaid';
alter table orders add column if not exists fulfillment_status text not null default 'unfulfilled';
alter table orders add column if not exists customer_email text;
alter table orders add column if not exists shipping_address jsonb not null default '{}'::jsonb;
alter table products add column if not exists product_type text;
alter table products add column if not exists vendor text;
alter table products add column if not exists published_at timestamptz;
alter table products add column if not exists seo jsonb not null default '{}'::jsonb;

alter table categories enable row level security;
alter table product_categories enable row level security;
alter table product_variants enable row level security;
alter table inventory_levels enable row level security;
alter table order_items enable row level security;

create policy categories_member_all on categories for all to authenticated
using(is_store_member(store_id)) with check(is_store_member(store_id));
create policy product_categories_member_all on product_categories for all to authenticated
using(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)))
with check(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)));
create policy variants_member_all on product_variants for all to authenticated
using(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)))
with check(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)));
create policy inventory_member_all on inventory_levels for all to authenticated
using(exists(select 1 from product_variants v join products p on p.id=v.product_id where v.id=variant_id and is_store_member(p.store_id)))
with check(exists(select 1 from product_variants v join products p on p.id=v.product_id where v.id=variant_id and is_store_member(p.store_id)));
create policy order_items_member_select on order_items for select to authenticated
using(exists(select 1 from orders o where o.id=order_id and is_store_member(o.store_id)));
