create table if not exists inventory_movements(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete restrict,
  type text not null check(type in ('sale','refund','restock','manual','reservation','release','adjustment')),
  quantity_delta integer not null check(quantity_delta<>0),
  reference_type text,
  reference_id text,
  actor_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_store_created_idx
  on inventory_movements(store_id,created_at desc);

create index if not exists inventory_movements_variant_created_idx
  on inventory_movements(variant_id,created_at desc);

create or replace function bravoshop_set_inventory(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_track_inventory boolean,
  p_allow_backorder boolean,
  p_actor_user_id uuid
)
returns setof inventory_levels
language plpgsql
as $$
declare
  current_level inventory_levels%rowtype;
  next_level inventory_levels%rowtype;
  current_store_id uuid;
  previous_quantity integer := 0;
begin
  if p_quantity < 0 then
    return;
  end if;

  select store_id
    into current_store_id
    from product_variants
    where id=p_variant_id and store_id=p_store_id
    for update;
  if not found then
    return;
  end if;

  select * into current_level
    from inventory_levels
    where variant_id=p_variant_id
    for update;
  if found then
    previous_quantity := current_level.quantity;
    if not p_allow_backorder and current_level.reserved>p_quantity then
      return;
    end if;

    update inventory_levels
      set quantity=p_quantity,
          track_inventory=p_track_inventory,
          allow_backorder=p_allow_backorder,
          updated_at=now()
      where variant_id=p_variant_id
      returning * into next_level;
  else
    insert into inventory_levels(
      variant_id,quantity,reserved,track_inventory,allow_backorder,updated_at
    ) values(
      p_variant_id,p_quantity,0,p_track_inventory,p_allow_backorder,now()
    )
    returning * into next_level;
  end if;

  if next_level.quantity<>previous_quantity then
    insert into inventory_movements(
      store_id,variant_id,type,quantity_delta,reference_type,actor_user_id
    ) values(
      current_store_id,p_variant_id,'manual',next_level.quantity-previous_quantity,'manual',p_actor_user_id
    );
  end if;
  return next next_level;
end;
$$;

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
    subtotal,shipping_total,tax_total,total,customer_email,shipping_address,payment_provider,
    provider_payment_id,paid_at
  ) values(
    order_id,checkout_row.store_id,order_customer_id,generated_order_number,'confirmed','paid','unfulfilled',
    checkout_row.currency,checkout_row.subtotal,checkout_row.shipping_total,checkout_row.tax_total,
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
        if checkout_row.inventory_reserved then
          other_reserved := case
            when inventory_row.reserved>=item_row.quantity
              then inventory_row.reserved-item_row.quantity
            else inventory_row.reserved
          end;
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

        if sold_from_stock>0 then
          insert into inventory_movements(
            store_id,variant_id,type,quantity_delta,reference_type,reference_id
          ) values(
            checkout_row.store_id,item_row.variant_id,'sale',-sold_from_stock,'order',order_id::text
          );
        end if;
        if sold_from_stock<item_row.quantity then
          insert into order_events(order_id,event_type,message,metadata)
          values(
            order_id,
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
        insert into order_events(order_id,event_type,message,metadata)
        values(
          order_id,
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

  insert into order_events(order_id,event_type,message,metadata)
  values(
    order_id,'payment.succeeded','Pago confirmado por Stripe',
    jsonb_build_object('payment_intent',p_payment_intent_id,'event_id',p_event_id)
  );
  return order_id;
end;
$$;
