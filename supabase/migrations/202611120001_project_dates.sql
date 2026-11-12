-- ============================================================
-- Project start date + target completion date, shown on the project cards.
--
-- Both optional. Until they're set, the cards fall back to the project's
-- created date and its latest WBS platform Completion milestone.
-- Edited from Projects → ⋯ → Edit details (projects_update RLS: managers only).
-- ============================================================

alter table public.projects
  add column if not exists start_date date,
  add column if not exists target_completion_date date;

alter table public.projects drop constraint if exists projects_dates_order_chk;
alter table public.projects add constraint projects_dates_order_chk
  check (start_date is null or target_completion_date is null or target_completion_date >= start_date);
