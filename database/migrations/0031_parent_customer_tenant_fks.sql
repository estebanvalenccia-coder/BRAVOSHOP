-- Enforce same-store parent/customer relationships at database level.
do $$
begin
 if exists(select 1 from categories c join categories p on p.id=c.parent_id where c.parent_id is not null and c.store_id<>p.store_id)
 then raise exception 'Existing category parent tenant mismatch'; end if;
end $$;

do $$
begin
 if not exists(select 1 from pg_constraint where conname='orders_customer_store_fk') then
  alter table orders add constraint orders_customer_store_fk
   foreign key(customer_id,store_id) references customers(id,store_id) on delete restrict;
 end if;
 if not exists(select 1 from pg_constraint where conname='categories_parent_store_fk') then
  alter table categories add constraint categories_parent_store_fk
   foreign key(parent_id,store_id) references categories(id,store_id) on delete restrict;
 end if;
end $$;
