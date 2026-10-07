-- Database-level tenant validation for order items.
create or replace function bravoshop_validate_order_item_tenant()
returns trigger language plpgsql as $$
declare
  owner_store uuid;
  product_store uuid;
  variant_store uuid;
  variant_product uuid;
begin
  select store_id into owner_store from orders where id=new.order_id;
  if owner_store is null then raise exception 'Order not found'; end if;

  if new.product_id is not null then
    select store_id into product_store from products where id=new.product_id;
    if product_store is null or product_store<>owner_store then
      raise exception 'Order product tenant mismatch';
    end if;
  end if;

  if new.variant_id is not null then
    select store_id,product_id into variant_store,variant_product
    from product_variants where id=new.variant_id;
    if variant_store is null or variant_store<>owner_store then
      raise exception 'Order variant tenant mismatch';
    end if;
    if new.product_id is not null and variant_product<>new.product_id then
      raise exception 'Order variant/product mismatch';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if exists(
    select 1
    from order_items oi
    join orders o on o.id=oi.order_id
    left join products p on p.id=oi.product_id
    left join product_variants v on v.id=oi.variant_id
    where (oi.product_id is not null and (p.id is null or p.store_id<>o.store_id))
       or (oi.variant_id is not null and (v.id is null or v.store_id<>o.store_id))
       or (oi.product_id is not null and oi.variant_id is not null and v.product_id<>oi.product_id)
  ) then
    raise exception 'Existing order item tenant mismatch';
  end if;
end $$;

drop trigger if exists order_items_tenant_guard on order_items;
create trigger order_items_tenant_guard
before insert or update of order_id,product_id,variant_id on order_items
for each row execute function bravoshop_validate_order_item_tenant();
