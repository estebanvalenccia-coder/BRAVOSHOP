alter table checkout_sessions add column if not exists shipping_rate_id uuid;
alter table checkout_sessions add column if not exists shipping_rate_name text;
alter table orders add column if not exists shipping_rate_id uuid;
alter table orders add column if not exists shipping_method text;
create index if not exists checkout_sessions_shipping_rate_idx on checkout_sessions(store_id,shipping_rate_id) where shipping_rate_id is not null;
create index if not exists orders_shipping_rate_idx on orders(store_id,shipping_rate_id) where shipping_rate_id is not null;
