create table if not exists newsletter_subscribers(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 email text not null,
 status text not null default 'active' check(status in ('active','unsubscribed')),
 consent_at timestamptz not null default now(),
 unsubscribed_at timestamptz,
 source text not null default 'storefront',
 unsubscribe_token uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create unique index if not exists newsletter_subscribers_store_email_uidx
 on newsletter_subscribers(store_id,lower(email));
create unique index if not exists newsletter_subscribers_unsubscribe_token_uidx
 on newsletter_subscribers(unsubscribe_token);
create index if not exists newsletter_subscribers_store_status_idx
 on newsletter_subscribers(store_id,status,created_at desc);
