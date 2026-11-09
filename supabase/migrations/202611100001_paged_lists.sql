-- ============================================================
-- Paged lists, stage 1: the Bugs page asks the database for one page of bugs
-- (plus the counts its chips and header need) instead of loading every bug.
--
-- list_bugs mirrors the app's live-board filter (src/shared/filters.js
-- filterBugs): bugs on releases that aren't closed, filtered on bug, release
-- and project fields. It runs as the caller, so row-level security applies.
-- ============================================================

-- the lookups the Releases and Bugs pages page through
create index if not exists bugs_release_id_idx on public.bugs (release_id);
create index if not exists bugs_created_at_idx on public.bugs (created_at desc, id);
create index if not exists releases_project_id_idx on public.releases (project_id);
create index if not exists releases_date_idx on public.releases (date desc, created_at desc, id);
create index if not exists releases_status_idx on public.releases (status);

/* p_filters keys (all optional; '' or 'all' = no filter):
     search, status, severity, platform, tag, feature, project, team,
     environment, developer, qa, from, to (YYYY-MM-DD, on the bug's created date, UTC)
   p_project_ids  the caller's projects; null = every project they can read
   p_quick        all | needsDev | awaitingQa | verified | carried | aging
   p_sort         newest | oldest
   Returns { total, counts, listed, scopeActive, rows, aging, agingTotal, releases }. */
create or replace function public.list_bugs(
  p_filters jsonb default '{}'::jsonb,
  p_project_ids uuid[] default null,
  p_quick text default 'all',
  p_sort text default 'newest',
  p_offset integer default 0,
  p_limit integer default 20
) returns jsonb
  language sql stable security invoker set search_path = public as $$
  with f as (
    select
      nullif(nullif(trim(p_filters->>'search'), ''), 'all') as search,
      nullif(nullif(p_filters->>'status', ''), 'all') as status,
      nullif(nullif(p_filters->>'severity', ''), 'all') as severity,
      nullif(nullif(p_filters->>'platform', ''), 'all') as platform,
      nullif(nullif(p_filters->>'tag', ''), 'all') as tag,
      nullif(nullif(p_filters->>'feature', ''), 'all') as feature,
      nullif(nullif(p_filters->>'project', ''), 'all') as project,
      nullif(nullif(p_filters->>'team', ''), 'all') as team,
      nullif(nullif(p_filters->>'environment', ''), 'all') as environment,
      nullif(nullif(p_filters->>'developer', ''), 'all') as developer,
      nullif(nullif(p_filters->>'qa', ''), 'all') as qa,
      nullif(p_filters->>'from', '') as date_from,
      nullif(p_filters->>'to', '') as date_to
  ),
  -- the live board: bugs on releases that aren't closed, in the caller's projects
  scope as (
    select b.*, p.name as project_name, r.platform as r_platform, r.project_id as r_project_id,
           coalesce(r.environment, 'Production') as r_environment, r.submitted_by_id as r_developer,
           r.assigned_qa as r_qa, coalesce(p.team_id::text, '') as r_team
    from public.bugs b
    join public.releases r on r.id = b.release_id
    left join public.projects p on p.id = r.project_id
    where r.status <> 'closed'
      and (p_project_ids is null or r.project_id = any(p_project_ids))
  ),
  filtered as (
    select s.*,
           -- same rule as bugSlaLevel: not verified and open for 75% of the 5-day SLA
           (s.status <> 'verified' and s.created_at <= now() - interval '90 hours') as is_aging
    from scope s, f
    where (f.status is null or s.status = f.status)
      and (f.severity is null or s.severity = f.severity)
      and (f.platform is null or s.r_platform = f.platform)
      and (f.tag is null or s.tags ? f.tag)
      and (f.feature is null or coalesce(nullif(s.feature, ''), 'Unassigned') = f.feature)
      and (f.project is null or s.r_project_id::text = f.project)
      and (f.team is null or s.r_team = f.team)
      and (f.environment is null or s.r_environment = f.environment)
      and (f.developer is null or s.r_developer::text = f.developer)
      and (f.qa is null or s.r_qa::text = f.qa)
      and (f.date_from is null or (s.created_at at time zone 'utc')::date >= f.date_from::date)
      and (f.date_to is null or (s.created_at at time zone 'utc')::date <= f.date_to::date)
      and (f.search is null
           or s.title ilike '%' || replace(replace(replace(f.search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or coalesce(s.project_name, '') ilike '%' || replace(replace(replace(f.search, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  listed as (
    select * from filtered
    where case coalesce(p_quick, 'all')
      when 'needsDev' then status in ('open', 'in_progress', 'disputed')
      when 'awaitingQa' then status in ('fixed', 'pending_tl')
      when 'verified' then status = 'verified'
      when 'carried' then carried_forward
      when 'aging' then is_aging
      else true end
  ),
  page as (
    select * from listed
    order by
      case when p_sort = 'oldest' then created_at end asc,
      case when p_sort = 'oldest' then null else created_at end desc,
      id
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 200)
  ),
  aging as (
    select * from filtered where is_aging order by created_at asc, id limit 50
  ),
  -- the releases the returned bugs sit on, so each card can show its build
  rels as (
    select r.* from public.releases r
    where r.id in (select release_id from page union select release_id from aging)
  ),
  strip as (
    -- the columns list_bugs adds for filtering, removed from the returned rows
    select array['project_name', 'r_platform', 'r_project_id', 'r_environment', 'r_developer', 'r_qa', 'r_team', 'is_aging'] as cols
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', (select jsonb_build_object(
        'needsDev', count(*) filter (where status in ('open', 'in_progress', 'disputed')),
        'awaitingQa', count(*) filter (where status in ('fixed', 'pending_tl')),
        'verified', count(*) filter (where status = 'verified'),
        'carried', count(*) filter (where carried_forward),
        'aging', count(*) filter (where is_aging)
      ) from filtered),
    'listed', (select count(*) from listed),
    'scopeActive', (select count(*) from scope where status <> 'verified'),
    'rows', coalesce((select jsonb_agg(to_jsonb(pg) - (select cols from strip)
        order by case when p_sort = 'oldest' then pg.created_at end asc,
                 case when p_sort = 'oldest' then null else pg.created_at end desc, pg.id)
      from page pg), '[]'::jsonb),
    'aging', coalesce((select jsonb_agg(to_jsonb(a) - (select cols from strip) order by a.created_at, a.id) from aging a), '[]'::jsonb),
    'agingTotal', (select count(*) from filtered where is_aging),
    'releases', coalesce((select jsonb_agg(to_jsonb(r)) from rels r), '[]'::jsonb)
  );
$$;

revoke all on function public.list_bugs(jsonb, uuid[], text, text, integer, integer) from public, anon;
grant execute on function public.list_bugs(jsonb, uuid[], text, text, integer, integer) to authenticated, service_role;
