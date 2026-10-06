alter table customers add column if not exists notes text;
alter table customers add column if not exists updated_at timestamptz not null default now();
