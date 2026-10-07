-- Preserve checkout discount accounting on paid orders.
alter table orders add column if not exists discount_code text;

create or replace function bravoshop_order_discount_guard()
returns trigger language plpgsql as $$
begin
 if new.discount_total<0 or new.discount_total>new.subtotal then raise exception 'Invalid order discount total'; end if;
 if new.total<0 then raise exception 'Invalid order total'; end if;
 return new;
end $$;
drop trigger if exists orders_discount_guard on orders;
create trigger orders_discount_guard before insert or update of subtotal,discount_total,total on orders
for each row execute function bravoshop_order_discount_guard();
