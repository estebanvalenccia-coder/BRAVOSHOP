-- BravoShop media library
create table media_assets(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  provider text not null default 'supabase',
  bucket text not null default 'store-media',
  object_path text not null,
  original_name text,
  mime_type text not null,
  size_bytes bigint not null default 0 check(size_bytes >= 0),
  width integer,
  height integer,
  alt_text text,
  kind text not null default 'image',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(provider,bucket,object_path)
);
create index media_assets_store_created_idx on media_assets(store_id,created_at desc);

create table product_media(
  product_id uuid not null references products(id) on delete cascade,
  media_id uuid not null references media_assets(id) on delete cascade,
  position integer not null default 0,
  is_primary boolean not null default false,
  primary key(product_id,media_id)
);
create index product_media_product_position_idx on product_media(product_id,position);

alter table media_assets enable row level security;
alter table product_media enable row level security;

create policy media_member_select on media_assets for select to authenticated
using(is_store_member(store_id));
create policy media_member_insert on media_assets for insert to authenticated
with check(is_store_member(store_id) and created_by=(select auth.uid()));
create policy media_member_update on media_assets for update to authenticated
using(is_store_member(store_id))
with check(is_store_member(store_id));
create policy media_member_delete on media_assets for delete to authenticated
using(is_store_member(store_id));

create policy product_media_member_select on product_media for select to authenticated
using(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)));
create policy product_media_member_insert on product_media for insert to authenticated
with check(exists(
  select 1 from products p join media_assets m on m.id=media_id
  where p.id=product_id and p.store_id=m.store_id and is_store_member(p.store_id)
));
create policy product_media_member_update on product_media for update to authenticated
using(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)))
with check(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)));
create policy product_media_member_delete on product_media for delete to authenticated
using(exists(select 1 from products p where p.id=product_id and is_store_member(p.store_id)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('store-media','store-media',true,15728640,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy store_media_insert on storage.objects for insert to authenticated
with check(
  bucket_id='store-media'
  and (storage.foldername(name))[1] is not null
  and is_store_member(((storage.foldername(name))[1])::uuid)
);
create policy store_media_select on storage.objects for select to authenticated
using(
  bucket_id='store-media'
  and (storage.foldername(name))[1] is not null
  and is_store_member(((storage.foldername(name))[1])::uuid)
);
create policy store_media_update on storage.objects for update to authenticated
using(
  bucket_id='store-media'
  and (storage.foldername(name))[1] is not null
  and is_store_member(((storage.foldername(name))[1])::uuid)
)
with check(
  bucket_id='store-media'
  and (storage.foldername(name))[1] is not null
  and is_store_member(((storage.foldername(name))[1])::uuid)
);
create policy store_media_delete on storage.objects for delete to authenticated
using(
  bucket_id='store-media'
  and (storage.foldername(name))[1] is not null
  and is_store_member(((storage.foldername(name))[1])::uuid)
);
