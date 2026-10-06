create table if not exists platform_bootstrap_state(
  singleton boolean primary key default true check(singleton=true),
  initial_super_admin_activated_at timestamptz
);

insert into platform_bootstrap_state(singleton,initial_super_admin_activated_at)
select true,case when exists(select 1 from app_users where role='super_admin') then now() else null end
on conflict(singleton) do nothing;

create or replace function bravoshop_activate_initial_super_admin(
  p_user_id uuid,
  p_email text,
  p_password_hash text,
  p_name text
)
returns table(id uuid,email text,name text,role text)
language plpgsql
as $$
declare
  activated_at timestamptz;
  new_user app_users%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('bravoshop-initial-super-admin',0));
  select initial_super_admin_activated_at
    into activated_at
    from platform_bootstrap_state
    where singleton=true
    for update;

  if activated_at is not null then
    return;
  end if;

  insert into app_users(id,email,password_hash,name,role)
  values(p_user_id,p_email,p_password_hash,p_name,'super_admin')
  on conflict(email) do nothing
  returning * into new_user;

  if not found then
    return;
  end if;

  update platform_bootstrap_state
    set initial_super_admin_activated_at=now()
    where singleton=true;

  return query select new_user.id,new_user.email,new_user.name,new_user.role;
end;
$$;
