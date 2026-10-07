-- Release discount claims for abandoned/expired checkout exactly once.
alter table checkout_sessions add column if not exists discount_usage_released_at timestamptz;
create or replace function bravoshop_release_checkout_discount(p_checkout_id uuid)
returns boolean language plpgsql as $$
declare c checkout_sessions%rowtype;
begin
 select * into c from checkout_sessions where id=p_checkout_id for update;
 if not found or c.discount_code is null or c.discount_usage_released_at is not null or c.status='completed' then return false; end if;
 update discount_codes set usage_count=greatest(0,usage_count-1),updated_at=now()
  where store_id=c.store_id and upper(code)=upper(c.discount_code);
 update checkout_sessions set discount_usage_released_at=now(),updated_at=now() where id=c.id;
 return true;
end $$;

create or replace function bravoshop_release_expired_inventory_reservations()
returns integer language plpgsql as $$
declare r record; released integer:=0;
begin
 for r in select id from checkout_sessions where expires_at<=now() and status<>'completed' for update skip locked loop
  if bravoshop_release_checkout_inventory(r.id,'expired',null) then released:=released+1; end if;
  perform bravoshop_release_checkout_discount(r.id);
 end loop;
 return released;
end $$;
