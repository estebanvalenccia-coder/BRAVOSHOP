alter table orders add column if not exists payment_provider text;
alter table orders add column if not exists provider_payment_id text;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists refunded_total numeric(12,2) not null default 0;

create table if not exists order_refunds(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references orders(id) on delete cascade,
 amount numeric(12,2) not null check(amount>0),
 currency text not null,
 status text not null default 'pending',
 reason text,
 provider text,
 provider_refund_id text,
 requested_by uuid references app_users(id) on delete set null,
 created_at timestamptz not null default now(),
 processed_at timestamptz
);
create index if not exists order_refunds_order_idx on order_refunds(order_id,created_at desc);
