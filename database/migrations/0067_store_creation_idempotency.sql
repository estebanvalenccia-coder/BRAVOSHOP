-- Idempotent merchant onboarding: the request key and store are committed atomically.
-- Repeated requests from the same merchant must return the original store.
create table if not exists store_creation_requests(
 user_id uuid not null references app_users(id) on delete cascade,
 request_key uuid not null,
 store_id uuid not null unique references stores(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,request_key)
);
create index if not exists store_creation_requests_recent_idx on store_creation_requests(created_at);
