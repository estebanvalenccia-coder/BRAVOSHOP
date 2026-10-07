-- Premium visual templates are a paid Premium-plan capability.
insert into plan_features(plan_id,feature_key,enabled,limits)
select id,'premium_templates',true,'{}'::jsonb
from plans
where slug='premium' and status='active'
on conflict(plan_id,feature_key) do update set enabled=true;

delete from plan_features pf
using plans p
where pf.plan_id=p.id
  and p.slug<>'premium'
  and pf.feature_key='premium_templates';
