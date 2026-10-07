create or replace function bravoshop_refresh_store_billing(p_store_id uuid)
returns text language plpgsql as $$
declare
 current_status text;
 sub store_subscriptions%rowtype;
 complimentary_valid boolean:=false;
begin
 select status into current_status
 from stores
 where id=p_store_id
 for update;
 if not found then return null; end if;

 select * into sub
 from store_subscriptions
 where store_id=p_store_id
 for update;

 if not found then
  if current_status='trial' then
   update stores set status='unpaid',updated_at=now() where id=p_store_id;
   current_status:='unpaid';
  end if;
  return current_status;
 end if;

 complimentary_valid:=sub.complimentary_reason is not null
  and (sub.complimentary_until is null or sub.complimentary_until>now());

 if sub.provider_subscription_id is null
    and not complimentary_valid
    and (
      (sub.status='trialing' and (sub.trial_ends_at is null or sub.trial_ends_at<=now()))
      or
      (sub.status='active' and sub.complimentary_reason is not null and sub.complimentary_until is not null and sub.complimentary_until<=now())
    )
 then
  update store_subscriptions
  set status='expired',updated_at=now()
  where store_id=p_store_id;

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
  where s.status in ('trial','active')
    and ss.provider_subscription_id is null
    and (
      (ss.status='trialing' and (ss.trial_ends_at is null or ss.trial_ends_at<=now()))
      or
      (ss.status='active' and ss.complimentary_reason is not null and ss.complimentary_until is not null and ss.complimentary_until<=now())
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
