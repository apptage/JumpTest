-- ============================================================
-- Run once in the Supabase SQL editor.
-- Release component + bug tags / feature / resolution.
-- ============================================================

alter table releases add column if not exists component text;

alter table bugs add column if not exists tags jsonb not null default '[]'::jsonb;
alter table bugs add column if not exists feature text;
alter table bugs add column if not exists resolution text;
