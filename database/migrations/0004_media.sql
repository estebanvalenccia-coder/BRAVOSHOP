create table if not exists media_assets(
id uuid primary key default gen_random_uuid(),
store_id uuid not null references stores(id) on delete cascade,
provider text not null default 'r2',
bucket text,
object_path text not null,
public_url text,
original_name text,
mime_type text not null,
size_bytes bigint not null default 0 check(size_bytes>=0),
width integer,
height integer,
alt_text text,
kind text not null default 'image',
created_by uuid references app_users(id) on delete set null,
created_at timestamptz not null default now(),
unique(provider,object_path)
);

create index if not exists media_assets_store_created_idx
on media_assets(store_id,created_at desc);

create table if not exists product_media(
product_id uuid not null references products(id) on delete cascade,
media_id uuid not null references media_assets(id) on delete cascade,
position integer not null default 0,
is_primary boolean not null default false,
primary key(product_id,media_id)
);

create index if not exists product_media_product_position_idx
on product_media(product_id,position);