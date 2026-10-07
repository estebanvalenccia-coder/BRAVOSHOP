alter table domains
  add column if not exists provider text,
  add column if not exists provider_domain_id text,
  add column if not exists infrastructure_status text not null default 'not_provisioned',
  add column if not exists dns_records jsonb not null default '[]'::jsonb,
  add column if not exists certificate_status text;

create unique index if not exists domains_provider_domain_uidx
  on domains(provider,provider_domain_id)
  where provider_domain_id is not null;
