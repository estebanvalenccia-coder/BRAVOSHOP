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

-- Central updates are one transaction with merchant draft/revision bookkeeping.
-- Return -1 if a concurrent edit changed the live theme, 0 if an unpublished
-- merchant draft exists; positive return is the new published draft version.
create or replace function bravoshop_admin_deploy_frontend(
 p_store_id uuid,p_template_id uuid,p_version integer,
 p_expected_theme jsonb,p_new_theme jsonb,p_baseline jsonb,p_actor uuid
) returns integer
language plpgsql as $$
declare d store_theme_drafts%rowtype;
 next_version integer;
 inserted_count integer;
begin
 select * into d from store_theme_drafts where store_id=p_store_id for update;
 if d.store_id is not null and d.version>d.published_version then
  return 0;
 end if;
 update store_theme set theme=p_new_theme
  where store_id=p_store_id and theme=p_expected_theme;
 if not found then return -1; end if;
 if d.store_id is null then
  insert into store_theme_drafts(store_id,theme,version,published_version,updated_by)
   values(p_store_id,p_new_theme,1,1,p_actor) on conflict do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count<>1 then raise exception 'concurrent_draft_creation'; end if;
  next_version:=1;
 else
  next_version:=d.version+1;
  update store_theme_drafts
   set theme=p_new_theme,version=next_version,published_version=next_version,updated_by=p_actor,updated_at=now()
   where store_id=p_store_id;
 end if;
 insert into store_theme_revisions(store_id,draft_version,theme,published_by)
  values(p_store_id,0,p_expected_theme,p_actor) on conflict(store_id,draft_version) do nothing;
 insert into store_theme_revisions(store_id,draft_version,theme,published_by)
  values(p_store_id,next_version,p_new_theme,p_actor) on conflict(store_id,draft_version) do nothing;
 insert into store_frontend_deployments(store_id,template_id,version,baseline_theme)
  values(p_store_id,p_template_id,p_version,p_baseline)
  on conflict(store_id) do update
  set template_id=excluded.template_id,version=excluded.version,
  baseline_theme=excluded.baseline_theme,updated_at=now();
 return next_version;
end;
$$;
