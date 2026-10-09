-- A previously retired merchant shop can be recovered by its original owner.
-- Recovery does not republish the shop or restart checkout/billing.
create or replace function bravoshop_restore_store(
 p_store_id uuid,p_owner_id uuid,p_confirm_slug text
) returns jsonb language plpgsql as $$
declare s stores%rowtype;
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
 if s.status<>'scheduled_for_deletion' then
  return jsonb_build_object('ok',false,'reason','not_retired');
 end if;

 -- Never silently reactivate a paid plan, shipping, checkout or publication.
 update stores set status='unpaid',updated_at=now() where id=p_store_id;
 update store_settings set settings=(
   coalesce(settings,'{}'::jsonb) ||
   jsonb_build_object('published',false,'preview_token',gen_random_uuid()::text)
 ) where store_id=p_store_id;
 -- Safety switches from the original retirement remain disabled until
 -- the merchant reviews the recovered account, billing and settings.
 return jsonb_build_object('ok',true,'restored',true,'status','unpaid');
end $$;
