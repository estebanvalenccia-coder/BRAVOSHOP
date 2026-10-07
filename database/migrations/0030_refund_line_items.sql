-- Explicit refund lines make partial stock restoration exact and auditable.
create table if not exists order_refund_items(
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references order_refunds(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete restrict,
  quantity integer not null check(quantity>0),
  amount numeric(12,2) not null check(amount>=0),
  restocked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(refund_id,order_item_id)
);
create index if not exists order_refund_items_refund_idx on order_refund_items(refund_id);

create or replace function bravoshop_add_refund_item(
 p_refund_id uuid,p_store_id uuid,p_order_item_id uuid,p_quantity integer
) returns boolean language plpgsql as $$
declare r order_refunds%rowtype; oi order_items%rowtype; already integer; line_amount numeric(12,2);
begin
 if p_quantity<=0 then return false; end if;
 select rf.* into r from order_refunds rf join orders o on o.id=rf.order_id
 where rf.id=p_refund_id and o.store_id=p_store_id for update of rf;
 if not found or r.status<>'processing' then return false; end if;
 select x.* into oi from order_items x join orders o on o.id=x.order_id
 where x.id=p_order_item_id and x.order_id=r.order_id and o.store_id=p_store_id;
 if not found then return false; end if;
 select coalesce(sum(ri.quantity),0)::int into already
 from order_refund_items ri join order_refunds rr on rr.id=ri.refund_id
 where ri.order_item_id=p_order_item_id and rr.status in ('processing','pending','succeeded');
 if already+p_quantity>oi.quantity then return false; end if;
 line_amount:=round((oi.unit_price*p_quantity)::numeric,2);
 insert into order_refund_items(refund_id,order_item_id,quantity,amount)
 values(p_refund_id,p_order_item_id,p_quantity,line_amount);
 return true;
end $$;

create or replace function bravoshop_restock_refunded_order(p_refund_id uuid,p_store_id uuid)
returns boolean language plpgsql as $$
declare r order_refunds%rowtype; item record; did_work boolean:=false;
begin
 select rf.* into r from order_refunds rf join orders o on o.id=rf.order_id
 where rf.id=p_refund_id and o.store_id=p_store_id for update of rf;
 if not found or r.status<>'succeeded' then return false; end if;

 if exists(select 1 from order_refund_items where refund_id=p_refund_id) then
  for item in select ri.id,ri.quantity,oi.variant_id from order_refund_items ri
    join order_items oi on oi.id=ri.order_item_id
    where ri.refund_id=p_refund_id and ri.restocked_at is null and oi.variant_id is not null
    order by oi.variant_id for update of ri
  loop
   update inventory_levels i set quantity=i.quantity+item.quantity,updated_at=now()
   from product_variants v where i.variant_id=item.variant_id and v.id=i.variant_id
     and v.store_id=p_store_id and i.track_inventory=true;
   if found then
    insert into inventory_movements(store_id,variant_id,type,quantity_delta,reference_type,reference_id)
    values(p_store_id,item.variant_id,'refund',item.quantity,'refund_item',item.id::text);
    update order_refund_items set restocked_at=now() where id=item.id;
    did_work:=true;
   end if;
  end loop;
 else
  if r.inventory_restocked_at is not null then return false; end if;
  if exists(select 1 from orders o where o.id=r.order_id and r.amount>=o.total) then
   for item in select oi.variant_id,oi.quantity from order_items oi
     where oi.order_id=r.order_id and oi.variant_id is not null order by oi.variant_id
   loop
    update inventory_levels i set quantity=i.quantity+item.quantity,updated_at=now()
    from product_variants v where i.variant_id=item.variant_id and v.id=i.variant_id
      and v.store_id=p_store_id and i.track_inventory=true;
    if found then
     insert into inventory_movements(store_id,variant_id,type,quantity_delta,reference_type,reference_id)
     values(p_store_id,item.variant_id,'refund',item.quantity,'refund',p_refund_id::text);
     did_work:=true;
    end if;
   end loop;
  end if;
 end if;
 update order_refunds set inventory_restocked_at=coalesce(inventory_restocked_at,now()) where id=p_refund_id;
 return did_work;
end $$;
