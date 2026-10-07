-- Atomic claim for checkout payment creation.
alter table checkout_sessions add column if not exists payment_creation_started_at timestamptz;

create or replace function bravoshop_claim_checkout_payment(p_checkout_id uuid)
returns boolean language plpgsql as $$
declare c checkout_sessions%rowtype;
begin
  select * into c from checkout_sessions where id=p_checkout_id for update;
  if not found or c.status='completed' or c.expires_at<=now() then return false; end if;
  if c.provider_payment_id is not null then return true; end if;
  if c.payment_creation_started_at is not null
     and c.payment_creation_started_at>now()-interval '2 minutes' then
    return false;
  end if;
  update checkout_sessions
  set payment_creation_started_at=now(),updated_at=now()
  where id=p_checkout_id;
  return true;
end;
$$;

create or replace function bravoshop_finish_checkout_payment_claim(
  p_checkout_id uuid,p_payment_intent_id text
)
returns boolean language plpgsql as $$
begin
  update checkout_sessions
  set status='payment_pending',payment_provider='stripe',
      provider_payment_id=coalesce(provider_payment_id,p_payment_intent_id),
      payment_creation_started_at=null,updated_at=now()
  where id=p_checkout_id and completed_order_id is null
    and (provider_payment_id is null or provider_payment_id=p_payment_intent_id);
  return found;
end;
$$;

create or replace function bravoshop_release_checkout_payment_claim(p_checkout_id uuid)
returns void language plpgsql as $$
begin
  update checkout_sessions set payment_creation_started_at=null,updated_at=now()
  where id=p_checkout_id and provider_payment_id is null and completed_order_id is null;
end;
$$;
