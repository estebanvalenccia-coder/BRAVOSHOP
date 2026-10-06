alter table checkout_sessions add column if not exists inventory_reserved boolean not null default false;
alter table orders add column if not exists order_number text;
alter table orders add column if not exists refund_reserved_total numeric(12,2) not null default 0 check(refund_reserved_total>=0);

create unique index if not exists orders_store_order_number_idx on orders(store_id,order_number) where order_number is not null;
create unique index if not exists orders_provider_payment_idx on orders(provider_payment_id) where provider_payment_id is not null;
create unique index if not exists order_refunds_provider_refund_idx on order_refunds(provider_refund_id) where provider_refund_id is not null;

create table if not exists stripe_webhook_events(
  event_id text primary key,
  event_type text not null,
  payment_intent_id text,
  processed_at timestamptz not null default now()
);

create or replace function bravoshop_release_checkout_inventory(p_checkout_id uuid,p_new_status text)
returns boolean language plpgsql as $$
declare
  checkout_row checkout_sessions%rowtype;
  item_row record;
begin
  if p_new_status not in ('expired','payment_failed') then
    raise exception 'Invalid checkout release status';
  end if;
  select * into checkout_row from checkout_sessions where id=p_checkout_id for update;
  if not found or checkout_row.status='completed' then return false; end if;
  if checkout_row.inventory_reserved then
    for item_row in
      select variant_id,sum(quantity)::integer as quantity
      from checkout_items
      where checkout_id=p_checkout_id and variant_id is not null
      group by variant_id
    loop
      update inventory_levels
      set reserved=greatest(0,reserved-item_row.quantity),updated_at=now()
      where variant_id=item_row.variant_id;
    end loop;
  end if;
  update checkout_sessions
  set inventory_reserved=false,status=p_new_status,updated_at=now()
  where id=p_checkout_id;
  return true;
end;
$$;

create or replace function bravoshop_release_expired_inventory_reservations()
returns integer language plpgsql as $$
declare
  checkout_row record;
  released integer := 0;
begin
  for checkout_row in
    select id from checkout_sessions
    where inventory_reserved=true and expires_at<=now() and status<>'completed'
    for update skip locked
  loop
    if bravoshop_release_checkout_inventory(checkout_row.id,'expired') then
      released := released+1;
    end if;
  end loop;
  return released;
end;
$$;

create or replace function bravoshop_reserve_checkout_inventory(p_checkout_id uuid)
returns boolean language plpgsql as $$
declare
  checkout_row checkout_sessions%rowtype;
  item_row record;
  inventory_tracked boolean;
begin
  select * into checkout_row from checkout_sessions where id=p_checkout_id for update;
  if not found or checkout_row.status='completed' or checkout_row.expires_at<=now() then return false; end if;
  if checkout_row.inventory_reserved then return true; end if;
  if checkout_row.status not in ('open','payment_pending','payment_failed') then return false; end if;
  begin
    for item_row in
      select variant_id,sum(quantity)::integer as quantity
      from checkout_items
      where checkout_id=p_checkout_id and variant_id is not null
      group by variant_id
      order by variant_id
    loop
      select track_inventory into inventory_tracked
      from inventory_levels where variant_id=item_row.variant_id for update;
      if not found then raise exception 'Inventory missing' using errcode='P0001'; end if;
      if inventory_tracked then
        update inventory_levels
        set reserved=reserved+item_row.quantity,updated_at=now()
        where variant_id=item_row.variant_id
          and (allow_backorder or quantity-reserved>=item_row.quantity);
        if not found then raise exception 'Insufficient inventory' using errcode='P0001'; end if;
      end if;
    end loop;
    update checkout_sessions
    set inventory_reserved=true,status='payment_pending',updated_at=now()
    where id=p_checkout_id;
  exception when sqlstate 'P0001' then
    return false;
  end;
  return true;
end;
$$;

create or replace function bravoshop_complete_paid_checkout(
  p_checkout_id uuid,
  p_payment_intent_id text,
  p_event_id text,
  p_amount bigint,
  p_currency text
)
returns uuid language plpgsql as $$
declare
  checkout_row checkout_sessions%rowtype;
  item_row record;
  order_id uuid := gen_random_uuid();
  order_customer_id uuid;
  generated_order_number text := 'BS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  inventory_tracked boolean;
begin
  insert into stripe_webhook_events(event_id,event_type,payment_intent_id)
  values(p_event_id,'payment_intent.succeeded',p_payment_intent_id)
  on conflict(event_id) do nothing;
  if not found then
    select id into order_id from orders where provider_payment_id=p_payment_intent_id;
    return order_id;
  end if;

  select * into checkout_row from checkout_sessions where id=p_checkout_id for update;
  if not found then raise exception 'Checkout not found'; end if;
  if checkout_row.completed_order_id is not null then return checkout_row.completed_order_id; end if;
  if checkout_row.provider_payment_id is distinct from p_payment_intent_id then
    raise exception 'PaymentIntent does not match checkout';
  end if;
  if p_amount<>round(checkout_row.total*100)::bigint or lower(p_currency)<>lower(checkout_row.currency) then
    raise exception 'Payment amount or currency does not match checkout';
  end if;

  if nullif(trim(checkout_row.customer_email),'') is not null then
    select id into order_customer_id from customers
    where store_id=checkout_row.store_id and lower(email)=lower(checkout_row.customer_email)
    order by created_at limit 1;
    if order_customer_id is null then
      insert into customers(store_id,email,name,phone)
      values(checkout_row.store_id,trim(checkout_row.customer_email),checkout_row.shipping_address->>'name',checkout_row.shipping_address->>'phone')
      returning id into order_customer_id;
    end if;
  end if;

  insert into orders(
    id,store_id,customer_id,order_number,status,payment_status,fulfillment_status,currency,
    subtotal,shipping_total,tax_total,total,customer_email,shipping_address,payment_provider,
    provider_payment_id,paid_at
  ) values(
    order_id,checkout_row.store_id,order_customer_id,generated_order_number,'confirmed','paid','unfulfilled',checkout_row.currency,
    checkout_row.subtotal,checkout_row.shipping_total,checkout_row.tax_total,checkout_row.total,
    checkout_row.customer_email,checkout_row.shipping_address,'stripe',p_payment_intent_id,now()
  );

  for item_row in select * from checkout_items where checkout_id=p_checkout_id order by id loop
    insert into order_items(id,order_id,product_id,variant_id,title,sku,quantity,unit_price,total,snapshot)
    values(gen_random_uuid(),order_id,item_row.product_id,item_row.variant_id,item_row.title,item_row.sku,item_row.quantity,item_row.unit_price,item_row.total,item_row.snapshot);

    if item_row.variant_id is not null then
      select track_inventory into inventory_tracked
      from inventory_levels where variant_id=item_row.variant_id for update;
      if found and inventory_tracked then
        if checkout_row.inventory_reserved then
          update inventory_levels
          set quantity=greatest(0,quantity-item_row.quantity),reserved=greatest(0,reserved-item_row.quantity),updated_at=now()
          where variant_id=item_row.variant_id and reserved>=item_row.quantity;
        else
          update inventory_levels
          set quantity=greatest(0,quantity-item_row.quantity),updated_at=now()
          where variant_id=item_row.variant_id and (allow_backorder or quantity-reserved>=item_row.quantity);
        end if;
        if not found then
          insert into order_events(order_id,event_type,message,metadata)
          values(order_id,'inventory.shortfall','Pago recibido con stock insuficiente',jsonb_build_object('variant_id',item_row.variant_id,'quantity',item_row.quantity));
        end if;
      end if;
    end if;
  end loop;

  update checkout_sessions
  set status='completed',inventory_reserved=false,completed_order_id=order_id,provider_payment_id=p_payment_intent_id,paid_at=now(),updated_at=now()
  where id=p_checkout_id;
  insert into order_events(order_id,event_type,message,metadata)
  values(order_id,'payment.succeeded','Pago confirmado por Stripe',jsonb_build_object('payment_intent',p_payment_intent_id,'event_id',p_event_id));
  return order_id;
end;
$$;

create or replace function bravoshop_create_refund(
  p_order_id uuid,
  p_store_id uuid,
  p_amount numeric,
  p_reason text,
  p_requested_by uuid
)
returns uuid language plpgsql as $$
declare
  order_row orders%rowtype;
  refund_id uuid := gen_random_uuid();
begin
  select * into order_row from orders where id=p_order_id and store_id=p_store_id for update;
  if not found or order_row.payment_status not in ('paid','partially_refunded') then return null; end if;
  if p_amount<=0 or order_row.total-order_row.refunded_total-order_row.refund_reserved_total<p_amount then return null; end if;

  update orders set refund_reserved_total=refund_reserved_total+p_amount where id=p_order_id;
  insert into order_refunds(id,order_id,amount,currency,status,reason,provider,requested_by)
  values(refund_id,p_order_id,p_amount,order_row.currency,'processing',p_reason,order_row.payment_provider,p_requested_by);
  insert into order_events(order_id,event_type,message,actor_user_id,metadata)
  values(p_order_id,'refund.requested','Reembolso enviado a Stripe',p_requested_by,jsonb_build_object('refund_id',refund_id,'amount',p_amount));
  return refund_id;
end;
$$;

create or replace function bravoshop_update_refund(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_new_status text
)
returns uuid language plpgsql as $$
declare
  refund_row order_refunds%rowtype;
  order_row orders%rowtype;
begin
  if p_new_status not in ('pending','succeeded','failed') then raise exception 'Invalid refund status'; end if;
  select * into refund_row from order_refunds where id=p_refund_id for update;
  if not found then return null; end if;
  select * into order_row from orders where id=refund_row.order_id for update;
  if not found then return null; end if;
  if refund_row.status='succeeded' then return refund_row.order_id; end if;

  update order_refunds
  set provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),status=p_new_status,
      processed_at=case when p_new_status in ('succeeded','failed') then now() else processed_at end
  where id=p_refund_id;

  if p_new_status='succeeded' then
    update orders
    set refunded_total=refunded_total+refund_row.amount,
        refund_reserved_total=greatest(0,refund_reserved_total-refund_row.amount),
        payment_status=case when refunded_total+refund_row.amount>=total then 'refunded' else 'partially_refunded' end,
        updated_at=now()
    where id=refund_row.order_id;
    insert into order_events(order_id,event_type,message,metadata)
    values(refund_row.order_id,'refund.succeeded','Reembolso confirmado por Stripe',jsonb_build_object('refund_id',p_refund_id,'provider_refund_id',p_provider_refund_id,'amount',refund_row.amount));
  elsif p_new_status='failed' and refund_row.status<>'failed' then
    update orders
    set refund_reserved_total=greatest(0,refund_reserved_total-refund_row.amount),updated_at=now()
    where id=refund_row.order_id;
    insert into order_events(order_id,event_type,message,metadata)
    values(refund_row.order_id,'refund.failed','Stripe no pudo completar el reembolso',jsonb_build_object('refund_id',p_refund_id,'provider_refund_id',p_provider_refund_id));
  end if;
  return refund_row.order_id;
end;
$$;