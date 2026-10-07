-- Secure merchant password recovery with one-time tokens and session revocation.
alter table app_users add column if not exists session_version integer not null default 0 check(session_version>=0);

create table if not exists password_reset_tokens(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references app_users(id) on delete cascade,
 token_hash text not null unique,
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists password_reset_tokens_user_active_idx
 on password_reset_tokens(user_id,expires_at desc) where used_at is null;

create or replace function bravoshop_reset_password(p_token_hash text,p_password_hash text)
returns uuid language plpgsql as $$
declare t password_reset_tokens%rowtype; uid uuid;
begin
 select * into t from password_reset_tokens
 where token_hash=p_token_hash and used_at is null and expires_at>now()
 for update;
 if not found then return null; end if;

 update app_users
 set password_hash=p_password_hash,session_version=session_version+1,updated_at=now()
 where id=t.user_id and status='active'
 returning id into uid;
 if uid is null then return null; end if;

 update password_reset_tokens set used_at=now() where user_id=uid and used_at is null;
 return uid;
end $$;
