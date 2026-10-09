-- BravoShop Control: versioned frontends, independent of merchant content.
create table if not exists platform_frontend_templates(
 id uuid primary key default gen_random_uuid(),
 name text not null,
 sector text not null default 'general',
 description text not null default '',
 draft_theme jsonb not null default '{}'::jsonb,
 version integer not null default 0 check(version >= 0),
 created_by uuid references app_users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists platform_frontend_versions(
 template_id uuid not null references platform_frontend_templates(id) on delete cascade,
 version integer not null check(version > 0),
 theme jsonb not null,
 notes text not null default '',
 published_by uuid references app_users(id) on delete set null,
 published_at timestamptz not null default now(),
 primary key(template_id,version)
);
create table if not exists store_frontend_deployments(
 store_id uuid primary key references stores(id) on delete cascade,
 template_id uuid not null references platform_frontend_templates(id) on delete restrict,
 version integer not null,
 baseline_theme jsonb not null,
 updated_at timestamptz not null default now(),
 foreign key(template_id,version) references platform_frontend_versions(template_id,version)
);
create index if not exists platform_frontend_templates_updated_idx on platform_frontend_templates(updated_at desc);
create index if not exists store_frontend_deployments_template_idx on store_frontend_deployments(template_id,version);
