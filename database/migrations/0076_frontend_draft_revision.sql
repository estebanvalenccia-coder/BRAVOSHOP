-- Reliable optimistic locking for Super Admin frontend template drafts.
alter table platform_frontend_templates
 add column if not exists draft_revision integer not null default 1 check(draft_revision>=1);
