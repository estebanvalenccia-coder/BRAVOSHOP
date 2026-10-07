create table if not exists store_member_invitations(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 email text not null,
 role text not null check(role in ('admin','manager','staff','support','viewer')),
 status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
 invited_by uuid references app_users(id) on delete set null,
 expires_at timestamptz not null default now()+interval '30 days',
 accepted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists store_member_invitations_pending_uidx
 on store_member_invitations(store_id,lower(email))
 where status='pending';
create index if not exists store_member_invitations_email_idx
 on store_member_invitations(lower(email),status,expires_at);
