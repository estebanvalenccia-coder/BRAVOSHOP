-- Atomically create item-based refunds and reserve their value.
create or replace function bravoshop_create_item_refund(
 p_order_id uuid,p_store_id uuid,p_items jsonb,p_reason text,p_requested_by uuid
) returns table(refund_id uuid,amount numeric) language plpgsql as $$
declare o orders%rowtype; x jsonb; oi order_items%rowtype; q integer; used integer; total_amount numeric(12,2):=0; rid uuid:=gen_random_uuid();
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Invalid refund items'; end if;
 select * into o from orders where id=p_order_id and store_id=p_store_id for update;
 if not found or o.payment_status not in ('paid','partially_refunded') then return; end if;
 for x in select * from jsonb_array_elements(p_items) loop
  q:=nullif(x->>'quantity','')::integer;
  if q is null or q<=0 then raise exception 'Invalid refund quantity'; end if;
  select oi0.* into oi from order_items oi0 where oi0.id=(x->>'order_item_id')::uuid and oi0.order_id=o.id for update;
  if not found then raise exception 'Refund item not found'; end if;
  select coalesce(sum(ri.quantity),0)::int into used from order_refund_items ri join order_refunds r on r.id=ri.refund_id
   where ri.order_item_id=oi.id and r.status in ('processing','pending','succeeded');
  if q>oi.quantity-used then raise exception 'Refund quantity unavailable'; end if;
  total_amount:=total_amount+round(oi.unit_price*q,2);
 end loop;
 if total_amount<=0 or o.total-o.refunded_total-o.refund_reserved_total<total_amount then return; end if;
 update orders set refund_reserved_total=refund_reserved_total+total_amount where id=o.id and store_id=p_store_id;
 insert into order_refunds(id,order_id,store_id,amount,currency,status,reason,provider,requested_by)
 values(rid,o.id,p_store_id,total_amount,o.currency,'processing',p_reason,o.payment_provider,p_requested_by);
 for x in select * from jsonb_array_elements(p_items) loop
  q:=(x->>'quantity')::integer;
  select * into oi from order_items where id=(x->>'order_item_id')::uuid and order_id=o.id;
  insert into order_refund_items(refund_id,order_item_id,quantity,amount)
  values(rid,oi.id,q,round(oi.unit_price*q,2));
 end loop;
 insert into order_events(order_id,store_id,event_type,message,actor_user_id,metadata)
 values(o.id,p_store_id,'refund.requested','Reembolso por artículos enviado a Stripe',p_requested_by,jsonb_build_object('refund_id',rid,'amount',total_amount,'items',p_items));
 return query select rid,total_amount;
end $$;
