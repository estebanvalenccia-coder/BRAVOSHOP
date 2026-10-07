-- Bind notification outbox rows to the same tenant as their order.
do $$ begin
 if not exists(select 1 from pg_constraint where conname='notification_outbox_order_store_fk') then
  alter table notification_outbox add constraint notification_outbox_order_store_fk
   foreign key(order_id,store_id) references orders(id,store_id) on delete cascade;
 end if;
end $$;
