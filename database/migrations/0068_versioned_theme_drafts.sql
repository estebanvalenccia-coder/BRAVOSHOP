create table if not exists store_theme_drafts(
 store_id uuid primary key references stores(id) on delete cascade,
 theme jsonb not null,
 version integer not null default 1 check(version>=1),
 published_version integer not null default 0 check(published_version>=0 and published_version<=version),
 updated_by uuid references app_users(id) on delete set null,
 updated_at timestamptz not null default now()
);
create table if not exists store_theme_revisions(
 id bigint generated always as identity primary key,
 store_id uuid not null references stores(id) on delete cascade,
 draft_version integer not null,
 theme jsonb not null,
 published_by uuid references app_users(id) on delete set null,
 published_at timestamptz not null default now(),
 unique(store_id,draft_version)
);
create index if not exists store_theme_revisions_latest_idx on store_theme_revisions(store_id,published_at desc);
create or replace function bravoshop_publish_theme_draft(p_store_id uuid,p_expected_version integer,p_actor uuid)
returns table(version integer,published_version integer)
language plpgsql
as $$
declare d store_theme_drafts%rowtype;
begin
 select * into d from store_theme_drafts where store_id=p_store_id for update;
 if not found or d.version<>p_expected_version then
  raise exception 'theme_version_conflict' using errcode='P0001';
 end if;
 if d.published_version=d.version then
  raise exception 'theme_already_published' using errcode='P0001';
 end if;
 insert into store_theme_revisions(store_id,draft_version,theme,published_by)
 select store_id,0,theme,p_actor from store_theme where store_id=p_store_id
 on conflict(store_id,draft_version) do nothing;
 insert into store_theme(store_id,theme) values(p_store_id,d.theme)
 on conflict(store_id) do update set theme=excluded.theme;
 insert into store_theme_revisions(store_id,draft_version,theme,published_by)
 values(p_store_id,d.version,d.theme,p_actor) on conflict(store_id,draft_version) do nothing;
 update store_theme_drafts set published_version=d.version where store_id=p_store_id;
 return query select d.version,d.version;
end;
$$;
