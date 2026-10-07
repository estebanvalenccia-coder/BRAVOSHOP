-- Give order child records explicit tenant ownership.
alter table order_events add column if not exists store_id uuid;
alter table order_refunds add column if not exists store_id uuid;

update order_events e set store_id=o.store_id from orders o where o.id=e.order_id and e.store_id is null;
update order_refunds r set store_id=o.store_id from orders o where o.id=r.order_id and r.store_id is null;

do $$
begin
 if exists(select 1 from order_events e join orders o on o.id=e.order_id where e.store_id is null or e.store_id<>o.store_id)
 then raise exception 'Existing order event tenant mismatch'; end if;
 if exists(select 1 from order_refunds r join orders o on o.id=r.order_id where r.store_id is null or r.store_id<>o.store_id)
 then raise exception 'Existing order refund tenant mismatch'; end if;
end $$;

alter table order_events alter column store_id set not null;
alter table order_refunds alter column store_id set not null;
create index if not exists order_events_store_order_idx on order_events(store_id,order_id,created_at desc);
create index if not exists order_refunds_store_order_idx on order_refunds(store_id,order_id,created_at desc);
create unique index if not exists order_refunds_id_store_uidx on order_refunds(id,store_id);

do $$
begin
 if not exists(select 1 from pg_constraint where conname='order_events_order_store_fk') then
  alter table order_events add constraint order_events_order_store_fk
   foreign key(order_id,store_id) references orders(id,store_id) on delete cascade;
 end if;
 if not exists(select 1 from pg_constraint where conname='order_refunds_order_store_fk') then
  alter table order_refunds add constraint order_refunds_order_store_fk
   foreign key(order_id,store_id) references orders(id,store_id) on delete cascade;
 end if;
end $$;

create or replace function bravoshop_fill_order_child_store()
returns trigger language plpgsql as $$
begin
 if new.store_id is null then select store_id into new.store_id from orders where id=new.order_id; end if;
 return new;
end $$;
drop trigger if exists order_events_fill_store on order_events;
create trigger order_events_fill_store before insert on order_events for each row execute function bravoshop_fill_order_child_store();
drop trigger if exists order_refunds_fill_store on order_refunds;
create trigger order_refunds_fill_store before insert on order_refunds for each row execute function bravoshop_fill_order_child_store();
