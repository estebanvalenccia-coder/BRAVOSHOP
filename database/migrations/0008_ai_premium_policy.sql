-- Seed stable plan identities and enforce the platform rule: every AI capability is Premium.
insert into plans(name,slug,status,is_public,metadata)
values
('Premium','premium','active',true,'{"tier":2,"ai":true}'::jsonb)
on conflict (slug) do update set name=excluded.name,status='active',is_public=true,metadata=plans.metadata||excluded.metadata;

-- AI capabilities are deliberately granted only to Premium here.
insert into plan_features(plan_id,feature_key,enabled,limits)
select id,feature_key,true,'{}'::jsonb
from plans
cross join (values ('ai_assistant'),('ai_images'),('image_analysis')) as f(feature_key)
where slug='premium'
on conflict(plan_id,feature_key) do update set enabled=true;

-- Defensive cleanup: lower plans cannot inherit AI through plan_features.
delete from plan_features pf
using plans p
where pf.plan_id=p.id
and p.slug<>'premium'
and pf.feature_key in ('ai_assistant','ai_images','image_analysis');
