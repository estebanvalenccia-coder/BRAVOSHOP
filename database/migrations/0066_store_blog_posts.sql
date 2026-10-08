create table if not exists store_blog_posts(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 title text not null,
 slug text not null,
 excerpt text not null default '',
 content text not null default '',
 cover_media_id uuid references media_assets(id) on delete set null,
 status text not null default 'draft' check(status in ('draft','published')),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(store_id,slug)
);
create index if not exists store_blog_posts_public_idx on store_blog_posts(store_id,published_at desc) where status='published';
