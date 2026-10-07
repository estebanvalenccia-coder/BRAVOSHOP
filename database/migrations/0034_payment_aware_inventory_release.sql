-- Make inventory release payment-intent aware and auditable.
create or replace function bravoshop_release_checkout_inventory(
  p_checkout_id uuid,p_new_status text,p_payment_intent_id text default null
)
returns boolean language plpgsql as $$
declare c checkout_sessions%rowtype; item record; v_store uuid;
begin
 if p_new_status not in ('expired','payment_failed') then raise exception 'Invalid checkout release status'; end if;
 select * into c from checkout_sessions where id=p_checkout_id for update;
 if not found or c.status='completed' or c.completed_order_id is not null then return false; end if;
 if p_new_status='payment_failed' and (
   p_payment_intent_id is null or c.provider_payment_id is null or c.provider_payment_id<>p_payment_intent_id
 ) then return false; end if;
 if c.inventory_reserved then
  for item in
   select variant_id,sum(quantity)::integer quantity from checkout_items
   where checkout_id=p_checkout_id and variant_id is not null group by variant_id order by variant_id
  loop
   select store_id into v_store from product_variants where id=item.variant_id;
   update inventory_levels set reserved=greatest(0,reserved-item.quantity),updated_at=now()
    where variant_id=item.variant_id;
   if found and v_store=c.store_id and item.quantity<>0 then
    insert into inventory_movements(store_id,variant_id,type,quantity_delta,reference_type,reference_id)
    values(c.store_id,item.variant_id,'release',item.quantity,'checkout',c.id::text);
   end if;
  end loop;
 end if;
 update checkout_sessions set inventory_reserved=false,status=p_new_status,updated_at=now()
 where id=p_checkout_id and completed_order_id is null;
 return found;
end $$;

create or replace function bravoshop_release_expired_inventory_reservations()
returns integer language plpgsql as $$
declare r record; released integer:=0;
begin
 for r in select id from checkout_sessions
  where inventory_reserved=true and expires_at<=now() and status<>'completed'
  for update skip locked
 loop
  if bravoshop_release_checkout_inventory(r.id,'expired',null) then released:=released+1; end if;
 end loop;
 return released;
end $$;
