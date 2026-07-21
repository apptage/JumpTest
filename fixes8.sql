-- ============================================================
-- Run once in the Supabase SQL editor.
-- Link bugs to WBS tasks (for WBS-enabled projects).
-- ============================================================

alter table bugs add column if not exists wbs_task_id uuid references wbs_tasks(id) on delete set null;
create index if not exists bugs_wbs_task_idx on bugs (wbs_task_id);
