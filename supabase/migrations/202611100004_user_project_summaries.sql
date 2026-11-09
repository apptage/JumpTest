-- ============================================================
-- Paged lists, stage 4: the app stops loading every release and bug at sign-in.
-- The two pages that still counted over all of them get their numbers here:
--
--   project_summaries (replaced)  adds what Manage Projects shows per project:
--     builds in QA, resolved and blocking bugs, and the latest build
--   user_summaries (new)          what the Users page shows per person
--
-- Both follow the browser code they replace (computeProjectSummaries and
-- computeUserSummaries in src/shared/releaseMetrics.js). They run as the caller,
-- so row-level security applies.
-- ============================================================

create index if not exists releases_submitted_by_idx on public.releases (submitted_by_id);
create index if not exists releases_assigned_qa_idx on public.releases (assigned_qa);
create index if not exists bugs_created_by_idx on public.bugs (created_by_id);

/* Per project: builds, openBugs (not verified), resolvedBugs (verified),
   blockingBugs (open critical/major), inQa (pending / in QA / QA done), latest
   (newest by created date, preferring one that isn't closed: { version, status }),
   lastDate (latest build date) and active (newest by date that isn't closed). */
create or replace function public.project_summaries(p_project_ids uuid[] default null)
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  with p as (
    select id from public.projects
    where p_project_ids is null or id = any(p_project_ids)
  ),
  rel as (
    select r.project_id, count(*) as builds, max(r.date) as latest_date,
           count(*) filter (where r.status in ('qa_pending', 'qa_in_progress', 'qa_done')) as in_qa
    from public.releases r join p on p.id = r.project_id
    group by r.project_id
  ),
  bug as (
    select r.project_id,
           count(*) filter (where b.status <> 'verified') as open_bugs,
           count(*) filter (where b.status = 'verified') as resolved_bugs,
           count(*) filter (where b.status <> 'verified' and b.severity in ('critical', 'major')) as blocking_bugs
    from public.bugs b
    join public.releases r on r.id = b.release_id
    join p on p.id = r.project_id
    group by r.project_id
  ),
  act as (
    select distinct on (r.project_id) r.project_id, r.version, r.platform
    from public.releases r join p on p.id = r.project_id
    where r.status <> 'closed'
    order by r.project_id, r.date desc, r.created_at desc, r.id
  ),
  lat as (
    select distinct on (r.project_id) r.project_id, r.version, r.status
    from public.releases r join p on p.id = r.project_id
    order by r.project_id, (r.status = 'closed'), coalesce(r.created_at, r.date::timestamptz) desc, r.id
  )
  select coalesce(jsonb_object_agg(p.id, jsonb_build_object(
    'builds', coalesce(rel.builds, 0),
    'openBugs', coalesce(bug.open_bugs, 0),
    'resolvedBugs', coalesce(bug.resolved_bugs, 0),
    'blockingBugs', coalesce(bug.blocking_bugs, 0),
    'inQa', coalesce(rel.in_qa, 0),
    'latest', rel.latest_date,
    'latestBuild', case when lat.project_id is null then null
                        else jsonb_build_object('version', lat.version, 'status', lat.status) end,
    'active', case when act.project_id is null then null
                   else jsonb_build_object('version', act.version, 'platform', act.platform) end
  )), '{}'::jsonb)
  from p
  left join rel on rel.project_id = p.id
  left join bug on bug.project_id = p.id
  left join act on act.project_id = p.id
  left join lat on lat.project_id = p.id;
$$;

/* Per person, over releases in p_project_ids (null = every project the caller
   can read) and the bugs on them:
     builds, openBugsOnBuilds, passRate (null when nothing was decided)  as developer
     reviewed, pendingReviews                                            as QA
     bugsFiled                                                           bugs they reported
   Pass rate follows computeReleaseMetrics: an approved build that still has an
   open critical/major bug counts as not passed. People with nothing are left out. */
create or replace function public.user_summaries(p_project_ids uuid[] default null)
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  with rel as (
    select r.* from public.releases r
    where p_project_ids is null or r.project_id = any(p_project_ids)
  ),
  bug as (
    select b.* from public.bugs b where b.release_id in (select id from rel)
  ),
  flags as (
    select r.id, r.submitted_by_id, r.assigned_qa, r.status,
           exists (select 1 from bug b where b.release_id = r.id and b.status <> 'verified'
                   and b.severity in ('critical', 'major')) as blocked
    from rel r
  ),
  dev as (
    select f.submitted_by_id as uid,
           count(*) as builds,
           count(*) filter (where f.status = 'approved' and not f.blocked) as approved,
           count(*) filter (where f.status = 'sent_back' or (f.status = 'approved' and f.blocked)) as rejected
    from flags f where f.submitted_by_id is not null
    group by f.submitted_by_id
  ),
  dev_bugs as (
    select r.submitted_by_id as uid, count(*) as open_bugs
    from bug b join rel r on r.id = b.release_id
    where r.submitted_by_id is not null and b.status <> 'verified'
    group by r.submitted_by_id
  ),
  qa as (
    select r.assigned_qa as uid,
           count(*) filter (where r.status in ('qa_done', 'approved', 'sent_back', 'closed')) as reviewed,
           count(*) filter (where r.status in ('qa_pending', 'qa_in_progress')) as pending
    from rel r where r.assigned_qa is not null
    group by r.assigned_qa
  ),
  filed as (
    select b.created_by_id as uid, count(*) as n
    from bug b where b.created_by_id is not null
    group by b.created_by_id
  ),
  people as (
    select uid from dev union select uid from qa union select uid from filed
  )
  select coalesce(jsonb_object_agg(pp.uid, jsonb_build_object(
    'builds', coalesce(dev.builds, 0),
    'openBugsOnBuilds', coalesce(dev_bugs.open_bugs, 0),
    'passRate', case when coalesce(dev.approved, 0) + coalesce(dev.rejected, 0) = 0 then null
                     else round(dev.approved * 100.0 / (dev.approved + dev.rejected))::int end,
    'reviewed', coalesce(qa.reviewed, 0),
    'pendingReviews', coalesce(qa.pending, 0),
    'bugsFiled', coalesce(filed.n, 0)
  )), '{}'::jsonb)
  from people pp
  left join dev on dev.uid = pp.uid
  left join dev_bugs on dev_bugs.uid = pp.uid
  left join qa on qa.uid = pp.uid
  left join filed on filed.uid = pp.uid;
$$;

revoke all on function public.project_summaries(uuid[]) from public, anon;
grant execute on function public.project_summaries(uuid[]) to authenticated, service_role;
revoke all on function public.user_summaries(uuid[]) from public, anon;
grant execute on function public.user_summaries(uuid[]) to authenticated, service_role;
