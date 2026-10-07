-- Bind shipping rates directly to their tenant.
alter table shipping_rates add column if not exists store_id uuid;
update shipping_rates r set store_id=z.store_id from shipping_zones z where z.id=r.zone_id and r.store_id is null;
do $$ begin
 if exists(select 1 from shipping_rates r join shipping_zones z on z.id=r.zone_id where r.store_id is null or r.store_id<>z.store_id)
 then raise exception 'Existing shipping rate tenant mismatch'; end if;
end $$;
alter table shipping_rates alter column store_id set not null;
create unique index if not exists shipping_zones_id_store_uidx on shipping_zones(id,store_id);
create index if not exists shipping_rates_store_zone_idx on shipping_rates(store_id,zone_id);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='shipping_rates_zone_store_fk') then
  alter table shipping_rates add constraint shipping_rates_zone_store_fk
   foreign key(zone_id,store_id) references shipping_zones(id,store_id) on delete cascade;
 end if;
end $$;
