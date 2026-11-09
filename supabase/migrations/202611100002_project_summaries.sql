-- ============================================================
-- Paged lists, stage 2: Project Hub's project cards get their numbers from the
-- database instead of from every release and bug loaded in the browser.
--
-- project_summaries returns, per project: how many builds it has, its open bugs
-- (any bug not verified), the date of its latest build, and its active build
-- (newest release that isn't closed). Same rules as the Project Hub picker had.
-- It runs as the caller, so row-level security applies.
-- ============================================================

create index if not exists releases_project_date_idx on public.releases (project_id, date desc, created_at desc, id);

/* p_project_ids: the projects to summarise; null = every project the caller can read.
   Returns { "<project id>": { builds, openBugs, latest, active: { version, platform } | null } }.
   Projects with no releases are included with zeros. */
create or replace function public.project_summaries(p_project_ids uuid[] default null)
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  with p as (
    select id from public.projects
    where p_project_ids is null or id = any(p_project_ids)
  ),
  rel as (
    select r.project_id, count(*) as builds, max(r.date) as latest
    from public.releases r join p on p.id = r.project_id
    group by r.project_id
  ),
  bug as (
    select r.project_id, count(*) as open_bugs
    from public.bugs b
    join public.releases r on r.id = b.release_id
    join p on p.id = r.project_id
    where b.status <> 'verified'
    group by r.project_id
  ),
  act as (
    select distinct on (r.project_id) r.project_id, r.version, r.platform
    from public.releases r join p on p.id = r.project_id
    where r.status <> 'closed'
    order by r.project_id, r.date desc, r.created_at desc, r.id
  )
  select coalesce(jsonb_object_agg(p.id, jsonb_build_object(
    'builds', coalesce(rel.builds, 0),
    'openBugs', coalesce(bug.open_bugs, 0),
    'latest', rel.latest,
    'active', case when act.project_id is null then null
                   else jsonb_build_object('version', act.version, 'platform', act.platform) end
  )), '{}'::jsonb)
  from p
  left join rel on rel.project_id = p.id
  left join bug on bug.project_id = p.id
  left join act on act.project_id = p.id;
$$;

revoke all on function public.project_summaries(uuid[]) from public, anon;
grant execute on function public.project_summaries(uuid[]) to authenticated, service_role;
