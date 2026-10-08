-- Complete zero-total checkouts atomically, without creating a fake Stripe payment.
-- This function locks its checkout and rechecks tenant, inventory, expiry and payment state.
-- Safe to retry: completed free checkouts return the existing order ID.
create or replace function bravoshop_complete_free_checkout(
  p_checkout_id uuid,
  p_store_id uuid
) returns uuid
language plpgsql
as $$
declare
  checkout_row checkout_sessions%rowtype;
  item_row record;
  inventory_row inventory_levels%rowtype;
  variant_store uuid;
  order_id uuid := gen_random_uuid();
  order_customer_id uuid;
  generated_order_number text := 'BS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  sold_from_stock integer;
begin
  select * into checkout_row from checkout_sessions
  where id=p_checkout_id and store_id=p_store_id for update;
  if not found then return null; end if;

  if checkout_row.completed_order_id is not null then
    if exists(
      select 1 from orders
      where id=checkout_row.completed_order_id and store_id=p_store_id
        and payment_provider='free' and payment_status='paid' and total=0
    ) then
      return checkout_row.completed_order_id;
    end if;
    return null;
  end if;

  if checkout_row.total<>0
    or checkout_row.status<>'payment_pending'
    or checkout_row.expires_at<=now()
    or not checkout_row.inventory_reserved
    or checkout_row.provider_payment_id is not null
    or checkout_row.payment_provider is not null
    or checkout_row.payment_creation_started_at is not null
    or not exists(select 1 from stores where id=p_store_id and status in ('active','trial'))
    or not exists(select 1 from checkout_items where checkout_id=p_checkout_id)
  then return null; end if;

  -- Check all tracked reservations before writing the order. No partial stock changes.
  for item_row in
    select variant_id,sum(quantity)::integer as quantity
    from checkout_items
    where checkout_id=p_checkout_id
    group by variant_id order by variant_id
  loop
    if item_row.variant_id is null then
      raise exception 'free_checkout_variant_missing' using errcode='P0001';
    end if;
    select store_id into variant_store from product_variants
      where id=item_row.variant_id;
    if variant_store is distinct from p_store_id then
      raise exception 'free_checkout_tenant_mismatch' using errcode='P0001';
    end if;
    select * into inventory_row from inventory_levels
      where variant_id=item_row.variant_id for update;
    if not found then
      raise exception 'free_checkout_inventory_missing' using errcode='P0001';
    end if;
    if inventory_row.track_inventory and
      (inventory_row.reserved<item_row.quantity
        or (not inventory_row.allow_backorder and inventory_row.quantity<item_row.quantity))
    then
      raise exception 'free_checkout_inventory_shortfall' using errcode='P0001';
    end if;
  end loop;

  if nullif(trim(checkout_row.customer_email),'') is not null then
    select id into order_customer_id from customers
    where store_id=p_store_id and lower(email)=lower(checkout_row.customer_email)
    order by created_at limit 1;
    if order_customer_id is null then
      insert into customers(store_id,email,name,phone)
      values(p_store_id,trim(checkout_row.customer_email),
        checkout_row.shipping_address->>'name',checkout_row.shipping_address->>'phone')
      on conflict do nothing returning id into order_customer_id;
      if order_customer_id is null then
        select id into order_customer_id from customers
        where store_id=p_store_id and lower(email)=lower(checkout_row.customer_email)
        order by created_at limit 1;
      end if;
    end if;
  end if;

  insert into orders(
    id,store_id,customer_id,order_number,status,payment_status,fulfillment_status,
    currency,subtotal,discount_total,discount_code,shipping_total,shipping_rate_id,
    shipping_method,tax_total,total,customer_email,shipping_address,payment_provider,
    provider_payment_id,paid_at
  ) values(
    order_id,p_store_id,order_customer_id,generated_order_number,
    'confirmed','paid','unfulfilled',
    checkout_row.currency,checkout_row.subtotal,checkout_row.discount_total,
    checkout_row.discount_code,checkout_row.shipping_total,checkout_row.shipping_rate_id,
    checkout_row.shipping_rate_name,checkout_row.tax_total,0,
    checkout_row.customer_email,checkout_row.shipping_address,'free',null,now()
  );

  insert into order_items(
    id,order_id,product_id,variant_id,title,sku,quantity,unit_price,total,snapshot
  )
  select gen_random_uuid(),order_id,product_id,variant_id,title,sku,
    quantity,unit_price,total,snapshot
  from checkout_items where checkout_id=p_checkout_id;

  for item_row in
    select variant_id,sum(quantity)::integer as quantity
    from checkout_items
    where checkout_id=p_checkout_id
    group by variant_id order by variant_id
  loop
    select * into inventory_row from inventory_levels
      where variant_id=item_row.variant_id for update;
    if inventory_row.track_inventory then
      sold_from_stock:=least(inventory_row.quantity,item_row.quantity);
      update inventory_levels set
        quantity=quantity-sold_from_stock,
        reserved=reserved-item_row.quantity,
        updated_at=now()
      where variant_id=item_row.variant_id;
      insert into inventory_movements(
        store_id,variant_id,type,quantity_delta,reserved_delta,reference_type,reference_id
      ) values(
        p_store_id,item_row.variant_id,'sale',-sold_from_stock,
        -item_row.quantity,'order',order_id::text
      );
      if sold_from_stock<item_row.quantity then
        insert into order_events(order_id,store_id,event_type,message,metadata)
        values(order_id,p_store_id,'inventory.shortfall',
          'Pedido gratuito confirmado con unidades pendientes de reposición',
          jsonb_build_object('variant_id',item_row.variant_id,
            'quantity_requested',item_row.quantity,
            'quantity_from_stock',sold_from_stock));
      end if;
    end if;
  end loop;

  update checkout_sessions set
    status='completed',
    payment_provider='free',
    inventory_reserved=false,
    completed_order_id=order_id,
    paid_at=now(),
    updated_at=now()
  where id=p_checkout_id and store_id=p_store_id;

  insert into order_events(order_id,store_id,event_type,message,metadata)
  values(order_id,p_store_id,'order.free_confirmed',
    'Pedido de importe cero confirmado sin cargo a Stripe',
    jsonb_build_object('checkout_id',p_checkout_id));
  return order_id;
end;
$$;
