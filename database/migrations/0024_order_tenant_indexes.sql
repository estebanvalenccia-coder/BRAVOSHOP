-- Composite tenant keys for order graph.
create unique index if not exists customers_id_store_uidx on customers(id,store_id);
create unique index if not exists orders_id_store_uidx on orders(id,store_id);
create unique index if not exists categories_id_store_uidx on categories(id,store_id);
create unique index if not exists product_variants_product_store_uidx on product_variants(id,product_id,store_id);

do $$
begin
  if exists(
    select 1 from orders o join customers c on c.id=o.customer_id
    where o.customer_id is not null and c.store_id<>o.store_id
  ) then
    raise exception 'Existing order/customer tenant mismatch';
  end if;
  if exists(
    select 1 from order_items oi join orders o on o.id=oi.order_id
    left join products p on p.id=oi.product_id
    left join product_variants v on v.id=oi.variant_id
    where (oi.product_id is not null and (p.id is null or p.store_id<>o.store_id))
       or (oi.variant_id is not null and (v.id is null or v.store_id<>o.store_id))
  ) then
    raise exception 'Existing order item tenant mismatch';
  end if;
end $$;
