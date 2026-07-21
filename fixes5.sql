-- ============================================================
-- Run once in the Supabase SQL editor.
-- Adds lightweight timing columns so the dashboard can compute
-- time-in-status, SLA aging, and cycle-time analytics going forward.
-- ============================================================

alter table releases add column if not exists status_changed_at timestamptz;
alter table releases add column if not exists qa_assigned_at timestamptz;

-- backfill best-effort from existing data
update releases
set status_changed_at = coalesce(qa_completed_at, created_at, now())
where status_changed_at is null;

update releases
set qa_assigned_at = coalesce(created_at, now())
where assigned_qa is not null and qa_assigned_at is null;
