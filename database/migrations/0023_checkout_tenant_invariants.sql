-- Defense-in-depth tenant invariants for checkout and variants.

create unique index if not exists product_variants_id_store_uidx
  on product_variants(id,store_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='product_variants_product_store_fk'
  ) then
    alter table product_variants
      add constraint product_variants_product_store_fk
      foreign key(product_id,store_id)
      references products(id,store_id)
      on delete cascade;
  end if;
end $$;

create or replace function bravoshop_enforce_checkout_item_tenant()
returns trigger
language plpgsql
as $$
declare
  checkout_store uuid;
  product_store uuid;
  variant_store uuid;
  variant_product uuid;
begin
  select store_id into checkout_store
  from checkout_sessions
  where id=new.checkout_id;

  if checkout_store is null then
    raise exception 'Checkout not found';
  end if;

  select store_id into product_store
  from products
  where id=new.product_id;

  if product_store is null or product_store<>checkout_store then
    raise exception 'Checkout product tenant mismatch';
  end if;

  if new.variant_id is not null then
    select store_id,product_id into variant_store,variant_product
    from product_variants
    where id=new.variant_id;

    if variant_store is null
       or variant_store<>checkout_store
       or variant_product<>new.product_id then
      raise exception 'Checkout variant tenant mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists checkout_items_tenant_guard on checkout_items;
create trigger checkout_items_tenant_guard
before insert or update of checkout_id,product_id,variant_id
on checkout_items
for each row execute function bravoshop_enforce_checkout_item_tenant();

-- Verify existing rows before considering the migration healthy.
do $$
begin
  if exists(
    select 1
    from checkout_items ci
    join checkout_sessions cs on cs.id=ci.checkout_id
    join products p on p.id=ci.product_id
    left join product_variants v on v.id=ci.variant_id
    where p.store_id<>cs.store_id
       or (ci.variant_id is not null and (
         v.id is null or v.store_id<>cs.store_id or v.product_id<>ci.product_id
       ))
  ) then
    raise exception 'Existing checkout item tenant mismatch';
  end if;
end $$;
