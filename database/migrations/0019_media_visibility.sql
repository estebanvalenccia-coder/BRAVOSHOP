alter table media_assets
  add column if not exists visibility text not null default 'private';

alter table media_assets
  add constraint media_assets_visibility_check
  check(visibility in ('private','public'));

update media_assets m
set visibility='public'
where exists(
  select 1
  from product_media pm
  join products p on p.id=pm.product_id
  where pm.media_id=m.id
);

create index if not exists media_assets_store_visibility_idx
  on media_assets(store_id,visibility,created_at desc);
