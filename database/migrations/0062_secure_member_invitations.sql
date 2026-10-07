alter table store_member_invitations
 add column if not exists token_hash text;

create unique index if not exists store_member_invitations_token_hash_uidx
 on store_member_invitations(token_hash)
 where token_hash is not null;

-- Expire legacy email-only invitations because they cannot prove mailbox ownership.
update store_member_invitations
set status='expired',updated_at=now()
where status='pending' and token_hash is null;

create or replace function bravoshop_accept_store_invitation(
 p_token_hash text,
 p_user_id uuid
)
returns table(store_id uuid,role text) language plpgsql as $$
declare inv store_member_invitations%rowtype;
declare user_email text;
begin
 select lower(email) into user_email
 from app_users
 where id=p_user_id and status='active'
 limit 1;
 if user_email is null then return; end if;

 select * into inv
 from store_member_invitations
 where token_hash=p_token_hash
   and status='pending'
   and expires_at>now()
 for update;

 if not found or lower(inv.email)<>user_email then return; end if;

 insert into store_members(store_id,user_id,role,status)
 values(inv.store_id,p_user_id,inv.role,'active')
 on conflict(store_id,user_id) do update
 set role=case when store_members.role='owner' then store_members.role else excluded.role end,
     status='active',
     updated_at=now();

 update store_member_invitations
 set status='accepted',accepted_at=now(),token_hash=null,updated_at=now()
 where id=inv.id;

 return query select inv.store_id,inv.role;
end $$;
