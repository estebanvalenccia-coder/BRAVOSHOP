-- Give product/category links direct tenant ownership.
alter table product_categories add column if not exists store_id uuid;
update product_categories pc set store_id=p.store_id from products p where p.id=pc.product_id and pc.store_id is null;

do $$
begin
 if exists(
  select 1 from product_categories pc
  join products p on p.id=pc.product_id
  join categories c on c.id=pc.category_id
  where pc.store_id is null or pc.store_id<>p.store_id or pc.store_id<>c.store_id
 ) then raise exception 'Existing product/category tenant mismatch'; end if;
end $$;

alter table product_categories alter column store_id set not null;
create unique index if not exists product_categories_product_category_store_uidx on product_categories(product_id,category_id,store_id);

do $$
begin
 if not exists(select 1 from pg_constraint where conname='product_categories_product_store_fk') then
  alter table product_categories add constraint product_categories_product_store_fk
   foreign key(product_id,store_id) references products(id,store_id) on delete cascade;
 end if;
 if not exists(select 1 from pg_constraint where conname='product_categories_category_store_fk') then
  alter table product_categories add constraint product_categories_category_store_fk
   foreign key(category_id,store_id) references categories(id,store_id) on delete cascade;
 end if;
end $$;
