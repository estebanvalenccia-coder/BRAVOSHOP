-- Enforce immutable terminal refund statuses under a PostgreSQL row lock.
-- Existing refunded totals and provider IDs are not changed by this migration.
create or replace function bravoshop_update_refund_for_store(
  p_refund_id uuid,
  p_store_id uuid,
  p_provider_refund_id text,
  p_new_status text
)
returns uuid language plpgsql as $$
declare
  refund_row order_refunds%rowtype;
  order_row orders%rowtype;
begin
  if p_new_status not in ('pending','succeeded','failed') then raise exception 'Invalid refund status'; end if;
  select r.* into refund_row
  from order_refunds r
  join orders o on o.id=r.order_id
  where r.id=p_refund_id and o.store_id=p_store_id
  for update of r;
  if not found then return null; end if;

  select * into order_row from orders where id=refund_row.order_id and store_id=p_store_id for update;
  if not found then return null; end if;
  if refund_row.provider_refund_id is not null
     and p_provider_refund_id is not null
     and refund_row.provider_refund_id<>p_provider_refund_id then
    raise exception 'Refund provider id mismatch';
  end if;
  -- Stripe can send duplicate and out-of-order refund events. Terminal
  -- statuses must never regress to pending or be applied a second time.
  if refund_row.status in ('succeeded','failed') then
    return refund_row.order_id;
  end if;

  update order_refunds
  set provider_refund_id=coalesce(provider_refund_id,p_provider_refund_id),
      status=p_new_status,
      processed_at=case when p_new_status in ('succeeded','failed') then now() else processed_at end
  where id=p_refund_id;

  if p_new_status='succeeded' then
    update orders
    set refunded_total=refunded_total+refund_row.amount,
        refund_reserved_total=greatest(0,refund_reserved_total-refund_row.amount),
        payment_status=case when refunded_total+refund_row.amount>=total then 'refunded' else 'partially_refunded' end,
        updated_at=now()
    where id=refund_row.order_id and store_id=p_store_id;
    insert into order_events(order_id,event_type,message,metadata)
    values(refund_row.order_id,'refund.succeeded','Reembolso confirmado por Stripe',
      jsonb_build_object('refund_id',p_refund_id,'provider_refund_id',p_provider_refund_id,'amount',refund_row.amount));
  elsif p_new_status='failed' and refund_row.status<>'failed' then
    update orders
    set refund_reserved_total=greatest(0,refund_reserved_total-refund_row.amount),updated_at=now()
    where id=refund_row.order_id and store_id=p_store_id;
    insert into order_events(order_id,event_type,message,metadata)
    values(refund_row.order_id,'refund.failed','Stripe no pudo completar el reembolso',
      jsonb_build_object('refund_id',p_refund_id,'provider_refund_id',p_provider_refund_id));
  end if;
  return refund_row.order_id;
end;
$$;
