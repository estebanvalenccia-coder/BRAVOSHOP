-- Multi-tenant hardening: stricter per-store uniqueness and atomic access-code redemption.

-- Domains must resolve to exactly one store regardless of hostname casing.
create unique index if not exists domains_hostname_ci_idx on domains(lower(hostname));

-- A customer email should not be silently duplicated within the same store.
create unique index if not exists customers_store_email_ci_uidx
  on customers(store_id, lower(email)) where email is not null;

-- Variants need a direct store_id for defense-in-depth scoping and per-store SKU uniqueness
-- (product_variants only referenced the store indirectly through products before).
alter table product_variants add column if not exists store_id uuid references stores(id) on delete cascade;
update product_variants v set store_id = p.store_id from products p where v.product_id = p.id and v.store_id is null;
alter table product_variants alter column store_id set not null;
create index if not exists product_variants_store_idx on product_variants(store_id);
create unique index if not exists product_variants_store_sku_uidx
  on product_variants(store_id, lower(sku)) where sku is not null;

-- Atomic, race-free access-code redemption: locks the code row, validates usage window and
-- max uses, enforces one redemption per store, increments uses, and grants the entitlement
-- or plan -- all in a single transaction. Replaces the previous read-then-write pattern in
-- server/routes/stores.js that could over-count `uses` under concurrent redemption attempts.
create or replace function bravoshop_redeem_access_code(
  p_code text,
  p_store_id uuid,
  p_user_id uuid
)
returns jsonb language plpgsql as $$
declare
  code_row access_codes%rowtype;
  redemption_id uuid := gen_random_uuid();
  entitlement_id uuid := gen_random_uuid();
begin
  select * into code_row from access_codes where code = p_code for update;
  if not found or not code_row.active then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if code_row.starts_at is not null and code_row.starts_at > now() then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if code_row.ends_at is not null and code_row.ends_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if code_row.grant_type not in ('feature', 'plan') then
    return jsonb_build_object('ok', false, 'error', 'unsupported');
  end if;
  -- Check "already redeemed by this store" before the global max_uses check so a store
  -- retrying its own prior redemption gets an accurate reason instead of a generic "invalid".
  if exists(
    select 1 from access_code_redemptions
    where access_code_id = code_row.id and store_id = p_store_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_redeemed');
  end if;
  if code_row.max_uses is not null and code_row.uses >= code_row.max_uses then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update access_codes set uses = uses + 1 where id = code_row.id;
  insert into access_code_redemptions(id, access_code_id, store_id, redeemed_by)
  values(redemption_id, code_row.id, p_store_id, p_user_id);

  if code_row.grant_type = 'feature' then
    insert into store_feature_entitlements(id, store_id, feature_key, source, source_id, permanent, ends_at, limits)
    values(
      entitlement_id, p_store_id, code_row.feature_key, 'access_code', code_row.id, code_row.permanent,
      case when code_row.permanent then null else code_row.ends_at end,
      coalesce(code_row.limits, '{}'::jsonb)
    );
  else
    insert into store_subscriptions(store_id, plan_id, status, complimentary_until, complimentary_reason, updated_at)
    values(
      p_store_id, code_row.plan_id, 'active',
      case
        when code_row.permanent then null
        when code_row.complimentary_days is not null then now() + (code_row.complimentary_days || ' days')::interval
        else code_row.ends_at
      end,
      coalesce(code_row.complimentary_reason, 'Código maestro'), now()
    )
    on conflict(store_id) do update set
      plan_id = excluded.plan_id, status = 'active',
      complimentary_until = excluded.complimentary_until,
      complimentary_reason = excluded.complimentary_reason, updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true, 'grant_type', code_row.grant_type,
    'feature_key', code_row.feature_key, 'permanent', code_row.permanent
  );
end;
$$;

-- Tenant-action audit trail used by the hardened webhook/auth code paths below.
alter table audit_log add column if not exists request_id text;
alter table audit_log add column if not exists ip text;
create index if not exists audit_log_store_created_idx on audit_log(store_id, created_at desc);
