-- A merchant's "Eliminar tienda" action must not cascade into irreversible
-- loss of financial history or silently stop a Stripe Billing subscription.
-- This is a reversible administrative retirement, NOT a hard SQL DELETE.
create or replace function bravoshop_retire_store(
 p_store_id uuid,p_owner_id uuid,p_confirm_slug text
) returns jsonb language plpgsql as $$
declare
 s stores%rowtype;
begin
 select * into s from stores where id=p_store_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
 if not exists(
  select 1 from store_members
  where store_id=p_store_id and user_id=p_owner_id
    and role='owner' and status='active'
 ) then return jsonb_build_object('ok',false,'reason','owner_required'); end if;
 if p_confirm_slug is distinct from s.slug then
  return jsonb_build_object('ok',false,'reason','confirmation_mismatch');
 end if;
 if s.status='scheduled_for_deletion' then
  return jsonb_build_object('ok',true,'retired',true,'already_retired',true);
 end if;

 -- A scheduled cancellation still owes service to the merchant until term end.
 if exists(
  select 1 from store_subscriptions
  where store_id=p_store_id
    and provider_subscription_id is not null
    and status not in ('canceled','expired','incomplete_expired')
 ) then return jsonb_build_object('ok',false,'reason','billing_active'); end if;

 if exists(
  select 1 from order_refunds
  where store_id=p_store_id and status in ('processing','pending')
 ) then return jsonb_build_object('ok',false,'reason','refunds_pending'); end if;
 if exists(
  select 1 from orders
  where store_id=p_store_id
    and (refund_reserved_total>0
      or (payment_status in ('paid','partially_refunded')
        and fulfillment_status not in ('delivered','fulfilled','canceled','cancelled')))
 ) then return jsonb_build_object('ok',false,'reason','orders_pending'); end if;
 if exists(
  select 1 from checkout_sessions
  where store_id=p_store_id and completed_order_id is null
    and provider_payment_id is not null
    and status not in ('payment_failed','expired')
 ) then return jsonb_build_object('ok',false,'reason','payments_pending'); end if;

 update stores set status='scheduled_for_deletion',updated_at=now()
 where id=p_store_id;
 update store_settings
 set settings=(coalesce(settings,'{}'::jsonb) || '{"published":false}'::jsonb)
   - 'preview_token'
 where store_id=p_store_id;
 update store_features set enabled=false
 where store_id=p_store_id and feature_key in ('checkout','cart','marketing');
 return jsonb_build_object('ok',true,'retired',true,'already_retired',false);
end $$;
