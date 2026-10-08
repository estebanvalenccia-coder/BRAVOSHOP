-- Avoid walking all historical expired checkouts on every new checkout.
-- Prior implementation repeatedly marked the same settled rows as expired.
-- Preserve the existing one-time discount release and inventory cleanup semantics.
create index if not exists checkout_sessions_expiry_work_idx
on checkout_sessions(expires_at,id)
where status<>'completed'
  and (
    status<>'expired'
    or inventory_reserved=true
    or (discount_code is not null and discount_usage_released_at is null)
  );

create or replace function bravoshop_release_expired_inventory_reservations()
returns integer language plpgsql as $$
declare
  r record;
  released integer:=0;
begin
  for r in
    select id from checkout_sessions
    where expires_at<=now()
      and status<>'completed'
      and (
        status<>'expired'
        or inventory_reserved=true
        or (discount_code is not null and discount_usage_released_at is null)
      )
    order by expires_at,id
    limit 200
    for update skip locked
  loop
    if bravoshop_release_checkout_inventory(r.id,'expired',null) then
      released:=released+1;
    end if;
    -- This helper's released_at marker prevents double-decrementing a coupon.
    perform bravoshop_release_checkout_discount(r.id);
  end loop;
  return released;
end $$;
