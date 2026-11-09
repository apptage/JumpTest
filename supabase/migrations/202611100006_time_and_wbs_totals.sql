-- ============================================================
-- Totals that pages used to work out by downloading every row:
--   user_time_totals   Users page: hours per person (all time + last 7 days)
--                      and the projects they logged time on
--   project_time_totals Project Hub → Time / Team: completed hours on one
--                      project, overall and per person
--   wbs_status_counts  Analytics: WBS work items per project and status
-- All run as the caller, so row-level security applies.
-- ============================================================

create index if not exists time_logs_user_idx on public.time_logs (user_id, log_date);
create index if not exists time_logs_project_idx on public.time_logs (project_id, log_date desc, created_at desc);

/* Same hours as computeUserSummaries: a finished entry counts its hours; a running
   or paused timer counts the time worked so far (worked_ms, plus now − resumed_at
   while running). "Week" = log_date on or after 7 days ago (UTC).
   Returns { "<user id>": { hours, hoursWeek, projectIds: [...] } }. */
create or replace function public.user_time_totals(p_user_ids uuid[])
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  with l as (
    select t.user_id, t.project_id, t.log_date,
           coalesce(t.hours::numeric,
             (t.worked_ms + case when t.status = 'running' and t.resumed_at is not null
                                 then greatest(0, extract(epoch from (now() - t.resumed_at)) * 1000) else 0 end) / 3600000.0) as h
    from public.time_logs t
    where t.user_id = any(p_user_ids)
  )
  select coalesce(jsonb_object_agg(x.user_id, jsonb_build_object(
    'hours', x.hours, 'hoursWeek', x.hours_week, 'projectIds', x.project_ids)), '{}'::jsonb)
  from (
    select l.user_id,
           sum(l.h) as hours,
           coalesce(sum(l.h) filter (where l.log_date >= ((now() at time zone 'utc')::date - 7)), 0) as hours_week,
           coalesce(jsonb_agg(distinct l.project_id) filter (where l.project_id is not null), '[]'::jsonb) as project_ids
    from l group by l.user_id
  ) x;
$$;

/* Completed entries only (a running or paused timer has no hours yet), as the
   Time tab's totals. Returns { total, entries, byUser: { "<user id>": hours } }. */
create or replace function public.project_time_totals(p_project uuid)
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce((select sum(hours) from public.time_logs where project_id = p_project and status = 'completed' and hours is not null), 0),
    'entries', (select count(*) from public.time_logs where project_id = p_project),
    'byUser', coalesce((
      select jsonb_object_agg(user_id, h) from (
        select user_id, sum(hours) as h from public.time_logs
        where project_id = p_project and status = 'completed' and hours is not null
        group by user_id
      ) u), '{}'::jsonb)
  );
$$;

/* Work items (milestones left out) per project and status:
   [{ "projectId", "status", "n" }, ...] */
create or replace function public.wbs_status_counts(p_project_ids uuid[])
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('projectId', project_id, 'status', status, 'n', n)), '[]'::jsonb)
  from (
    select project_id, status, count(*) as n
    from public.wbs_items
    where project_id = any(p_project_ids) and type <> 'milestone'
    group by project_id, status
  ) x;
$$;

revoke all on function public.user_time_totals(uuid[]) from public, anon;
revoke all on function public.project_time_totals(uuid) from public, anon;
revoke all on function public.wbs_status_counts(uuid[]) from public, anon;
grant execute on function public.user_time_totals(uuid[]) to authenticated, service_role;
grant execute on function public.project_time_totals(uuid) to authenticated, service_role;
grant execute on function public.wbs_status_counts(uuid[]) to authenticated, service_role;
