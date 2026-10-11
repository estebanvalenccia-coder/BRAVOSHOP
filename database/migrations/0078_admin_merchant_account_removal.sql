-- Super-admin deletion preserves stores and billing history. Runs atomically.
create or replace function bravoshop_admin_remove_merchant_account(
 p_user_id uuid, p_actor_id uuid, p_reason text, p_unlink_stores boolean, p_bulk boolean
) returns jsonb language plpgsql as $$
declare
 merchant app_users%rowtype;
 membership_count integer := 0;
 orphan_store_ids uuid[] := array[]::uuid[];
 suspended_count integer := 0;
begin
 if p_user_id is null or p_actor_id is null or p_user_id = p_actor_id then
  return jsonb_build_object('status','blocked','reason','Cuenta administrativa protegida');
 end if;
 select * into merchant from app_users where id=p_user_id for update;
 if not found then
  return jsonb_build_object('status','missing','reason','La cuenta ya no existe');
 end if;
 if merchant.role <> 'merchant' then
  return jsonb_build_object('status','blocked','reason','Cuenta administrativa protegida');
 end if;
 select count(*)::int into membership_count from store_members where user_id=p_user_id;
 if membership_count>0 and p_unlink_stores is not true then
  return jsonb_build_object('status','blocked',
   'reason','Tiene tiendas asociadas; activa la opción de desvinculación y confirma el borrado');
 end if;
 if membership_count>0 then
  perform s.id from stores s join store_members m on m.store_id=s.id
  where m.user_id=p_user_id order by s.id for update of s;
  select coalesce(array_agg(s.id),array[]::uuid[]) into orphan_store_ids
  from stores s where s.status<>'scheduled_for_deletion'
   and exists(select 1 from store_members m
    where m.store_id=s.id and m.user_id=p_user_id and m.status='active')
   and not exists(select 1 from store_members other
    where other.store_id=s.id and other.user_id<>p_user_id
     and other.role='owner' and other.status='active');
  if exists (
   select 1 from stores s where s.id=any(orphan_store_ids) and (
    exists(select 1 from store_payment_accounts pa where pa.store_id=s.id and pa.provider_account_id is not null)
    or exists(select 1 from store_subscriptions sub where sub.store_id=s.id and
      (sub.provider_customer_id is not null or sub.provider_subscription_id is not null or sub.provider_checkout_session_id is not null))
    or exists(select 1 from orders o where o.store_id=s.id)
    or exists(select 1 from checkout_sessions c where c.store_id=s.id and c.provider_payment_id is not null)
    or exists(select 1 from order_refunds r where r.store_id=s.id)
   )
  ) then
   return jsonb_build_object('status','blocked',
    'reason','Alguna tienda perdería su último propietario y tiene pagos, pedidos o facturación. Transfiere la propiedad o resuelve esas obligaciones primero');
  end if;
  update stores set status='suspended',updated_at=now()
  where id=any(orphan_store_ids) and status<>'scheduled_for_deletion';
  get diagnostics suspended_count=row_count;
  update store_settings set settings=(
    (coalesce(settings,'{}'::jsonb) || jsonb_build_object('published',false)) - 'preview_token'
   ) where store_id=any(orphan_store_ids);
  update store_features set enabled=false
   where store_id=any(orphan_store_ids) and feature_key in ('cart','checkout','marketing');
 end if;
 delete from app_users where id=p_user_id and role='merchant';
 if not found then raise exception 'Merchant disappeared during account removal'; end if;
 insert into audit_log(actor_user_id,actor_type,action,resource_type,resource_id,details)
 values(p_actor_id,'super_admin','user.deleted','deleted_user',p_user_id::text,
  jsonb_build_object('email',merchant.email,'bulk',p_bulk,
   'reason',p_reason,'unlinked_memberships',membership_count,
   'stores_suspended',suspended_count,'unlink_stores',p_unlink_stores));
 return jsonb_build_object('status','deleted','unlinked_memberships',membership_count,'suspended_stores',suspended_count);
end;
$$;
