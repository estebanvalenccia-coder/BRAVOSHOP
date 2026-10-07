-- Restore inventory exactly once when a refund succeeds.
alter table order_refunds add column if not exists inventory_restocked_at timestamptz;

create or replace function bravoshop_restock_refunded_order(
  p_refund_id uuid,p_store_id uuid
)
returns boolean language plpgsql as $$
declare r order_refunds%rowtype; item record; qty integer;
begin
  select rf.* into r
  from order_refunds rf join orders o on o.id=rf.order_id
  where rf.id=p_refund_id and o.store_id=p_store_id
  for update of rf;
  if not found or r.status<>'succeeded' or r.inventory_restocked_at is not null then return false; end if;

  for item in
    select oi.variant_id,oi.quantity,o.total
    from order_items oi join orders o on o.id=oi.order_id
    where oi.order_id=r.order_id and oi.variant_id is not null
    order by oi.variant_id
  loop
    qty:=case when r.amount>=item.total then item.quantity else 0 end;
    if qty>0 then
      update inventory_levels i
      set quantity=i.quantity+qty,updated_at=now()
      from product_variants v
      where i.variant_id=item.variant_id and v.id=i.variant_id and v.store_id=p_store_id and i.track_inventory=true;
      if found then
        insert into inventory_movements(store_id,variant_id,type,quantity_delta,reference_type,reference_id)
        values(p_store_id,item.variant_id,'refund',qty,'refund',p_refund_id::text);
      end if;
    end if;
  end loop;
  update order_refunds set inventory_restocked_at=now() where id=p_refund_id;
  return true;
end;
$$;
