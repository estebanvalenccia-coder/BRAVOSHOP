-- Commercial launch defaults: real paid plans, Premium template entitlement and one generated master code.
alter table plans add column if not exists currency text not null default 'EUR';

insert into plans(name,slug,status,monthly_price,annual_price,currency,trial_days,is_public,metadata)
values
 ('Basic','basic','active',14.99,149.90,'EUR',14,true,'{"tier":1,"paid":true,"description":"Catálogo, pedidos, inventario, clientes y storefront personalizable."}'::jsonb),
 ('Premium','premium','active',29.99,299.90,'EUR',14,true,'{"tier":2,"paid":true,"ai":true,"description":"Todo Basic más plantillas Premium y capacidades avanzadas."}'::jsonb)
on conflict (slug) do update set
 name=excluded.name,
 status='active',
 monthly_price=coalesce(plans.monthly_price,excluded.monthly_price),
 annual_price=coalesce(plans.annual_price,excluded.annual_price),
 currency=coalesce(nullif(plans.currency,''),excluded.currency),
 trial_days=case when plans.trial_days=0 then excluded.trial_days else plans.trial_days end,
 is_public=true,
 metadata=plans.metadata||excluded.metadata;

insert into plan_features(plan_id,feature_key,enabled,limits)
select id,'premium_templates',true,'{}'::jsonb from plans where slug='premium'
on conflict(plan_id,feature_key) do update set enabled=true;

insert into access_codes(code,name,grant_type,plan_id,permanent,max_uses,active,complimentary_reason,metadata)
select
 'BRAVO-MASTER-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
 'Código Máster BravoShop',
 'plan',
 p.id,
 true,
 null,
 true,
 'Acceso máster Premium sin cuota',
 '{"master":true}'::jsonb
from plans p
where p.slug='premium'
and not exists(select 1 from access_codes where metadata->>'master'='true');
