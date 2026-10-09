-- Version-safe, audited rollback of ONE tenant storefront to an older
-- immutable release of its already-installed central template.
create table if not exists store_frontend_rollbacks (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references stores(id) on delete cascade,
 template_id uuid not null references platform_frontend_templates(id) on delete restrict,
 from_version integer not null,
 to_version integer not null,
 protected_fields jsonb not null default '[]'::jsonb,
 performed_by uuid references app_users(id) on delete set null,
 performed_at timestamptz not null default now(),
 check(to_version>0 and to_version<from_version)
);
create index if not exists store_frontend_rollbacks_store_idx on store_frontend_rollbacks(store_id,performed_at desc);
create or replace function bravoshop_admin_rollback_frontend(
 p_store_id uuid,p_template_id uuid,p_expected_version integer,p_target_version integer,
 p_expected_theme jsonb,p_new_theme jsonb,p_target_baseline jsonb,p_actor uuid,p_protected_fields jsonb
) returns integer language plpgsql as $$
declare live record;
 result integer;
begin
 select template_id,version into live from store_frontend_deployments
 where store_id=p_store_id for update;
 if not found or live.template_id<>p_template_id or live.version<>p_expected_version
 then return -2; end if;
 if p_target_version<1 or p_target_version>=p_expected_version
 then return -3; end if;
 if not exists(select 1 from platform_frontend_versions where template_id=p_template_id and version=p_target_version)
 then return -3; end if;
 result:=bravoshop_admin_deploy_frontend(p_store_id,p_template_id,p_target_version,
  p_expected_theme,p_new_theme,p_target_baseline,p_actor);
 if result>0 then
  insert into store_frontend_rollbacks(store_id,template_id,from_version,to_version,protected_fields,performed_by)
  values(p_store_id,p_template_id,p_expected_version,p_target_version,
   coalesce(p_protected_fields,'[]'::jsonb),p_actor);
 end if;
 return result;
end;
$$;
