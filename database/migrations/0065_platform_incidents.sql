create table if not exists platform_incidents(
 id uuid primary key default gen_random_uuid(),
 source text not null,
 event_type text not null,
 service_id text,
 service_name text,
 deployment_id text,
 environment_name text,
 status text,
 summary text,
 received_at timestamptz not null default now()
);
create index if not exists platform_incidents_received_at_idx on platform_incidents(received_at desc);
create index if not exists platform_incidents_source_idx on platform_incidents(source,event_type);
