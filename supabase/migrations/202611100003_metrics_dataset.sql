-- ============================================================
-- Paged lists, stage 3: the Dashboard, Analytics, Reports and the Bugs page's
-- "Needs a decision" panel ask for the releases and bugs of a time window,
-- instead of using every release and bug loaded at sign-in.
--
-- The app keeps computing its numbers in the browser (same code as before), so
-- this returns rows, not totals. It returns everything those numbers need:
--   * live work: every release that isn't closed, whenever it was submitted
--   * the window: releases submitted, decided, changed or closed since p_since,
--     and the releases of bugs reported, verified or resolved since p_since
--   * the latest release of each project (by last activity), so project health
--     and "last activity" stay right for quiet projects
--   * every bug on the releases above
-- p_since null = all time. p_live_only = only live work (the Bugs page panel).
-- It runs as the caller, so row-level security applies.
-- ============================================================

create index if not exists bugs_verified_at_idx on public.bugs (verified_at) where verified_at is not null;
create index if not exists releases_created_at_idx on public.releases (created_at);

create or replace function public.metrics_dataset(
  p_project_ids uuid[] default null,
  p_since timestamptz default null,
  p_live_only boolean default false,
  p_slim boolean default true
) returns jsonb
  language sql stable security invoker set search_path = public as $$
  with scoped as (
    select r.* from public.releases r
    where p_project_ids is null or r.project_id = any(p_project_ids)
  ),
  window_bug_releases as (
    select distinct b.release_id
    from public.bugs b join scoped s on s.id = b.release_id
    where not p_live_only and p_since is not null
      and (b.created_at >= p_since or b.verified_at >= p_since or b.resolution_at >= p_since)
  ),
  latest as (
    select distinct on (s.project_id) s.id
    from scoped s
    where not p_live_only
    order by s.project_id, coalesce(s.status_changed_at, s.created_at) desc, s.id
  ),
  rel as (
    select s.* from scoped s
    where s.status <> 'closed'
       or (not p_live_only and (
            p_since is null
            or s.date >= (p_since at time zone 'utc')::date
            or s.created_at >= p_since
            or s.qa_completed_at >= p_since
            or s.status_changed_at >= p_since
            or s.closed_at >= p_since
            or s.id in (select release_id from window_bug_releases)
            or s.id in (select id from latest)))
  ),
  bug as (
    select b.* from public.bugs b where b.release_id in (select id from rel)
  )
  select jsonb_build_object(
    'releases', coalesce((select jsonb_agg(to_jsonb(r) order by r.date desc, r.created_at desc, r.id) from rel r), '[]'::jsonb),
    'bugs', coalesce((select jsonb_agg(
        case when p_slim then to_jsonb(b) - 'description' - 'screenshot_url' - 'resolution_note' else to_jsonb(b) end
        order by b.created_at desc, b.id) from bug b), '[]'::jsonb)
  );
$$;

revoke all on function public.metrics_dataset(uuid[], timestamptz, boolean, boolean) from public, anon;
grant execute on function public.metrics_dataset(uuid[], timestamptz, boolean, boolean) to authenticated, service_role;
