create or replace function bravoshop_refresh_store_billing(p_store_id uuid)
returns text language plpgsql as $$
declare
 current_status text;
 sub store_subscriptions%rowtype;
 complimentary_valid boolean:=false;
 local_trial_valid boolean:=false;
 should_block boolean:=false;
begin
 select status into current_status from stores where id=p_store_id for update;
 if not found then return null; end if;
 if current_status in ('suspended','maintenance','scheduled_for_deletion') then return current_status; end if;

 select * into sub from store_subscriptions where store_id=p_store_id for update;
 if not found then
  if current_status='trial' then
   update stores set status='unpaid',updated_at=now() where id=p_store_id;
   return 'unpaid';
  end if;
  return current_status;
 end if;

 complimentary_valid:=sub.complimentary_reason is not null
  and (sub.complimentary_until is null or sub.complimentary_until>now());
 local_trial_valid:=sub.trial_ends_at is not null and sub.trial_ends_at>now();

 if complimentary_valid then
  if sub.status='active' and current_status='unpaid' then
   update stores set status='active',updated_at=now() where id=p_store_id;
   return 'active';
  end if;
  return current_status;
 end if;

 if sub.status='active' then
  if sub.provider_subscription_id is null
     and sub.complimentary_reason is not null
     and sub.complimentary_until is not null
     and sub.complimentary_until<=now()
  then should_block:=true;
  else return current_status;
  end if;
 elsif sub.status='trialing' then
  if sub.provider_subscription_id is not null then return current_status; end if;
  if local_trial_valid then return current_status; end if;
  should_block:=true;
 elsif sub.status in ('checkout_pending','incomplete') then
  if local_trial_valid then return current_status; end if;
  should_block:=true;
 elsif sub.status in ('past_due','unpaid','paused','canceled','incomplete_expired','expired') then
  should_block:=true;
 end if;

 if should_block then
  if sub.provider_subscription_id is null and sub.status in ('trialing','checkout_pending','incomplete') then
   update store_subscriptions set status='expired',updated_at=now() where store_id=p_store_id;
  end if;
  if current_status in ('trial','active') then
   update stores set status='unpaid',updated_at=now() where id=p_store_id;
   current_status:='unpaid';
  end if;
 end if;

 return current_status;
end $$;

create or replace function bravoshop_expire_billing_access(p_limit integer default 200)
returns integer language plpgsql as $$
declare r record; changed integer:=0; before_status text; after_status text;
begin
 for r in
  select s.id
  from stores s
  join store_subscriptions ss on ss.store_id=s.id
  where s.status in ('trial','active','unpaid')
    and (
      ss.status in ('past_due','unpaid','paused','canceled','incomplete_expired','expired')
      or (ss.status in ('trialing','checkout_pending','incomplete') and (ss.trial_ends_at is null or ss.trial_ends_at<=now()))
      or (ss.status='active' and ss.provider_subscription_id is null and ss.complimentary_reason is not null and ss.complimentary_until is not null and ss.complimentary_until<=now())
    )
  order by ss.updated_at
  limit greatest(1,least(coalesce(p_limit,200),1000))
 loop
  select status into before_status from stores where id=r.id;
  after_status:=bravoshop_refresh_store_billing(r.id);
  if before_status is distinct from after_status then changed:=changed+1; end if;
 end loop;
 return changed;
end $$;
