create or replace function bravoshop_claim_stripe_webhook(
 p_event_id text,
 p_event_type text,
 p_account_id text default null
)
returns text language plpgsql as $$
declare c stripe_webhook_claims%rowtype;
begin
 insert into stripe_webhook_claims(event_id,event_type,account_id,status,attempts,locked_at)
 values(p_event_id,p_event_type,p_account_id,'processing',1,now())
 on conflict(event_id) do nothing;
 if found then return 'claimed'; end if;

 select * into c from stripe_webhook_claims where event_id=p_event_id for update;
 if c.status='processed' then return 'processed'; end if;
 if c.status='processing' and c.locked_at>now()-interval '5 minutes' then return 'busy'; end if;

 update stripe_webhook_claims
 set event_type=p_event_type,
     account_id=coalesce(p_account_id,account_id),
     status='processing',
     attempts=attempts+1,
     locked_at=now(),
     last_error=null,
     updated_at=now()
 where event_id=p_event_id;
 return 'claimed';
end $$;
