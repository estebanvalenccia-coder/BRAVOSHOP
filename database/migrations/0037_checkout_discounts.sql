-- Atomically claim discount usage when a checkout is created.
create or replace function bravoshop_claim_discount(
 p_store_id uuid,p_code text,p_subtotal numeric
) returns table(code text,discount_amount numeric) language plpgsql as $$
declare d discount_codes%rowtype; amt numeric(12,2);
begin
 select * into d from discount_codes
 where store_id=p_store_id and upper(discount_codes.code)=upper(trim(p_code))
 for update;
 if not found or not d.active or (d.starts_at is not null and d.starts_at>now())
  or (d.ends_at is not null and d.ends_at<=now())
  or (d.usage_limit is not null and d.usage_count>=d.usage_limit)
  or p_subtotal<d.minimum_amount then return; end if;
 amt:=case when d.kind='percent' then round(p_subtotal*(d.value/100),2) else least(p_subtotal,d.value) end;
 amt:=greatest(0,least(p_subtotal,amt));
 if amt<=0 then return; end if;
 update discount_codes set usage_count=usage_count+1,updated_at=now() where id=d.id;
 return query select d.code,amt;
end $$;
