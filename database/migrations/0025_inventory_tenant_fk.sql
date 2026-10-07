-- Bind inventory movements directly to their owning tenant.
do $$
begin
  if exists(
    select 1
    from inventory_movements im
    join product_variants v on v.id=im.variant_id
    where im.store_id<>v.store_id
  ) then
    raise exception 'Existing inventory movement tenant mismatch';
  end if;
end $$;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='inventory_movements_variant_store_fk') then
    alter table inventory_movements
      add constraint inventory_movements_variant_store_fk
      foreign key(variant_id,store_id)
      references product_variants(id,store_id)
      on delete restrict;
  end if;
end $$;
