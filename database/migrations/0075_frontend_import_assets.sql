create table if not exists platform_frontend_assets(
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null references platform_frontend_templates(id) on delete restrict,
 original_path text not null,
 object_path text not null unique,
 public_url text not null,
 mime_type text not null,
 size_bytes integer not null check(size_bytes>0 and size_bytes<=2097152),
 imported_by uuid references app_users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(template_id,original_path)
);
create index if not exists platform_frontend_assets_template_idx on platform_frontend_assets(template_id);
