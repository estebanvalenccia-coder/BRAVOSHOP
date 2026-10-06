create unique index if not exists products_id_store_uidx
  on products(id,store_id);

create unique index if not exists media_assets_id_store_uidx
  on media_assets(id,store_id);

alter table product_media
  add column if not exists store_id uuid;

update product_media pm
set store_id=p.store_id
from products p
where p.id=pm.product_id and pm.store_id is null;

alter table product_media
  alter column store_id set not null;

alter table product_media
  add constraint product_media_product_store_fk
  foreign key(product_id,store_id)
  references products(id,store_id)
  on delete cascade;

alter table product_media
  add constraint product_media_asset_store_fk
  foreign key(media_id,store_id)
  references media_assets(id,store_id)
  on delete cascade;

create index if not exists product_media_store_product_idx
  on product_media(store_id,product_id,position);
