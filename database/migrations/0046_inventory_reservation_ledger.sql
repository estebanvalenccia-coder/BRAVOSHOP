-- Separate physical stock changes from reservation changes in the inventory ledger.
alter table inventory_movements add column if not exists reserved_delta integer not null default 0;
alter table inventory_movements drop constraint if exists inventory_movements_quantity_delta_check;
alter table inventory_movements drop constraint if exists inventory_movements_delta_check;
update inventory_movements
set reserved_delta=quantity_delta,quantity_delta=0
where type='reservation' and reserved_delta=0 and quantity_delta<>0;
update inventory_movements
set reserved_delta=-abs(quantity_delta),quantity_delta=0
where type='release' and reserved_delta=0 and quantity_delta<>0;
alter table inventory_movements add constraint inventory_movements_delta_check
 check(quantity_delta<>0 or reserved_delta<>0);

create or replace function bravoshop_reserve_checkout_inventory(p_checkout_id uuid)
returns boolean language plpgsql as $$
declare
 checkout_row checkout_sessions%rowtype;
 item_row record;
 inventory_tracked boolean;
 variant_store uuid;
begin
 select * into checkout_row from checkout_sessions where id=p_checkout_id for update;
 if not found or checkout_row.status='completed' or checkout_row.expires_at<=now() then return false; end if;
 if checkout_row.inventory_reserved then return true; end if;
 if checkout_row.status not in ('open','payment_pending','payment_failed') then return false; end if;
 begin
  for item_row in
   select variant_id,sum(quantity)::integer quantity from checkout_items
   where checkout_id=p_checkout_id and variant_id is not null
   group by variant_id order by variant_id
  loop
   select store_id into variant_store from product_variants where id=item_row.variant_id;
   if variant_store is distinct from checkout_row.store_id then raise exception 'Checkout variant tenant mismatch' using errcode='P0001'; end if;
   select track_inventory into inventory_tracked from inventory_levels where variant_id=item_row.variant_id for update;
   if not found then raise exception 'Inventory missing' using errcode='P0001'; end if;
   if inventory_tracked then
    update inventory_levels set reserved=reserved+item_row.quantity,updated_at=now()
    where variant_id=item_row.variant_id and (allow_backorder or quantity-reserved>=item_row.quantity);
    if not found then raise exception 'Insufficient inventory' using errcode='P0001'; end if;
    insert into inventory_movements(store_id,variant_id,type,quantity_delta,reserved_delta,reference_type,reference_id)
    values(checkout_row.store_id,item_row.variant_id,'reservation',0,item_row.quantity,'checkout',checkout_row.id::text);
   end if;
  end loop;
  update checkout_sessions set inventory_reserved=true,status='payment_pending',updated_at=now() where id=p_checkout_id;
 exception when sqlstate 'P0001' then
  return false;
 end;
 return true;
end $$;

create or replace function bravoshop_release_checkout_inventory(
 p_checkout_id uuid,p_new_status text,p_payment_intent_id text default null
)
returns boolean language plpgsql as $$
declare c checkout_sessions%rowtype; item record; v_store uuid; current_reserved integer; release_qty integer;
begin
 if p_new_status not in ('expired','payment_failed') then raise exception 'Invalid checkout release status'; end if;
 select * into c from checkout_sessions where id=p_checkout_id for update;
 if not found or c.status='completed' or c.completed_order_id is not null then return false; end if;
 if p_new_status='payment_failed' and (p_payment_intent_id is null or c.provider_payment_id is null or c.provider_payment_id<>p_payment_intent_id) then return false; end if;
 if c.inventory_reserved then
  for item in
   select variant_id,sum(quantity)::integer quantity from checkout_items
   where checkout_id=p_checkout_id and variant_id is not null
   group by variant_id order by variant_id
  loop
   select store_id into v_store from product_variants where id=item.variant_id;
   if v_store is distinct from c.store_id then raise exception 'Checkout variant tenant mismatch'; end if;
   select reserved into current_reserved from inventory_levels where variant_id=item.variant_id for update;
   if not found then raise exception 'Inventory missing'; end if;
   release_qty:=least(current_reserved,item.quantity);
   if release_qty>0 then
    update inventory_levels set reserved=reserved-release_qty,updated_at=now() where variant_id=item.variant_id;
    insert into inventory_movements(store_id,variant_id,type,quantity_delta,reserved_delta,reference_type,reference_id)
    values(c.store_id,item.variant_id,'release',0,-release_qty,'checkout',c.id::text);
   end if;
  end loop;
 end if;
 update checkout_sessions set inventory_reserved=false,status=p_new_status,updated_at=now()
 where id=p_checkout_id and completed_order_id is null;
 return found;
end $$;

create or replace function bravoshop_complete_paid_checkout(
  p_checkout_id uuid,
  p_payment_intent_id text,
  p_event_id text,
  p_amount bigint,
  p_currency text
)
returns uuid
language plpgsql
as $$
declare
  checkout_row checkout_sessions%rowtype;
  item_row record;
  inventory_row inventory_levels%rowtype;
  order_id uuid := gen_random_uuid();
  order_customer_id uuid;
  generated_order_number text := 'BS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  available_stock integer;
  other_reserved integer;
  sold_from_stock integer;
  released_reserved integer;
begin
  insert into stripe_webhook_events(event_id,event_type,payment_intent_id)
  values(p_event_id,'payment_intent.succeeded',p_payment_intent_id)
  on conflict(event_id) do nothing;
  if not found then
    select id into order_id from orders where provider_payment_id=p_payment_intent_id;
    return order_id;
  end if;

  select * into checkout_row
    from checkout_sessions
    where id=p_checkout_id
    for update;
  if not found then raise exception 'Checkout not found'; end if;
  if checkout_row.completed_order_id is not null then
    return checkout_row.completed_order_id;
  end if;
  if checkout_row.provider_payment_id is not null
     and checkout_row.provider_payment_id is distinct from p_payment_intent_id then
    raise exception 'PaymentIntent does not match checkout';
  end if;
  if p_amount<>round(checkout_row.total*100)::bigint
     or lower(p_currency)<>lower(checkout_row.currency) then
    raise exception 'Payment amount or currency does not match checkout';
  end if;

  if nullif(trim(checkout_row.customer_email),'') is not null then
    select id into order_customer_id
      from customers
      where store_id=checkout_row.store_id
        and lower(email)=lower(checkout_row.customer_email)
      order by created_at
      limit 1;
    if order_customer_id is null then
      insert into customers(store_id,email,name,phone)
      values(
        checkout_row.store_id,
        trim(checkout_row.customer_email),
        checkout_row.shipping_address->>'name',
        checkout_row.shipping_address->>'phone'
      )
      on conflict do nothing
      returning id into order_customer_id;
      if order_customer_id is null then
        select id into order_customer_id
          from customers
          where store_id=checkout_row.store_id
            and lower(email)=lower(checkout_row.customer_email)
          order by created_at
          limit 1;
      end if;
    end if;
  end if;

  insert into orders(
    id,store_id,customer_id,order_number,status,payment_status,fulfillment_status,currency,
    subtotal,discount_total,discount_code,shipping_total,shipping_rate_id,shipping_method,tax_total,total,customer_email,shipping_address,payment_provider,
    provider_payment_id,paid_at
  ) values(
    order_id,checkout_row.store_id,order_customer_id,generated_order_number,'confirmed','paid','unfulfilled',
    checkout_row.currency,checkout_row.subtotal,checkout_row.discount_total,checkout_row.discount_code,checkout_row.shipping_total,checkout_row.shipping_rate_id,checkout_row.shipping_rate_name,checkout_row.tax_total,
    checkout_row.total,checkout_row.customer_email,checkout_row.shipping_address,'stripe',
    p_payment_intent_id,now()
  );

  for item_row in
    select * from checkout_items where checkout_id=p_checkout_id order by id
  loop
    insert into order_items(
      id,order_id,product_id,variant_id,title,sku,quantity,unit_price,total,snapshot
    ) values(
      gen_random_uuid(),order_id,item_row.product_id,item_row.variant_id,item_row.title,item_row.sku,
      item_row.quantity,item_row.unit_price,item_row.total,item_row.snapshot
    );

    if item_row.variant_id is not null then
      select * into inventory_row
        from inventory_levels
        where variant_id=item_row.variant_id
        for update;

      if found and inventory_row.track_inventory then
        released_reserved := 0;
        if checkout_row.inventory_reserved then
          released_reserved := least(inventory_row.reserved,item_row.quantity);
          other_reserved := inventory_row.reserved-released_reserved;
          available_stock := case
            when inventory_row.quantity>other_reserved
              then inventory_row.quantity-other_reserved
            else 0
          end;
          sold_from_stock := least(item_row.quantity,available_stock);
          update inventory_levels
            set quantity=quantity-sold_from_stock,
                reserved=other_reserved,
                updated_at=now()
            where variant_id=item_row.variant_id;
        else
          available_stock := case
            when inventory_row.quantity>inventory_row.reserved
              then inventory_row.quantity-inventory_row.reserved
            else 0
          end;
          sold_from_stock := least(item_row.quantity,available_stock);
          update inventory_levels
            set quantity=quantity-sold_from_stock,
                updated_at=now()
            where variant_id=item_row.variant_id;
        end if;

        if sold_from_stock>0 or released_reserved>0 then
          insert into inventory_movements(
            store_id,variant_id,type,quantity_delta,reserved_delta,reference_type,reference_id
          ) values(
            checkout_row.store_id,item_row.variant_id,'sale',-sold_from_stock,-released_reserved,'order',order_id::text
          );
        end if;
        if sold_from_stock<item_row.quantity then
          insert into order_events(order_id,store_id,event_type,message,metadata)
          values(
            order_id,checkout_row.store_id,
            'inventory.shortfall',
            'Pago recibido con stock insuficiente; requiere revisión',
            jsonb_build_object(
              'variant_id',item_row.variant_id,
              'quantity_requested',item_row.quantity,
              'quantity_from_stock',sold_from_stock
            )
          );
        end if;
      else
        insert into order_events(order_id,store_id,event_type,message,metadata)
        values(
          order_id,checkout_row.store_id,
          'inventory.shortfall',
          'Pago recibido sin nivel de inventario; requiere revisión',
          jsonb_build_object('variant_id',item_row.variant_id,'quantity_requested',item_row.quantity)
        );
      end if;
    end if;
  end loop;

  update checkout_sessions
    set status='completed',
        inventory_reserved=false,
        completed_order_id=order_id,
        provider_payment_id=p_payment_intent_id,
        paid_at=now(),
        updated_at=now()
    where id=p_checkout_id;

  insert into order_events(order_id,store_id,event_type,message,metadata)
  values(
    order_id,checkout_row.store_id,'payment.succeeded','Pago confirmado por Stripe',
    jsonb_build_object('payment_intent',p_payment_intent_id,'event_id',p_event_id)
  );
  return order_id;
end;
$$;
