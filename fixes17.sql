-- fixes17.sql — Public WBS share from the WBS page.
--
--  1) Let Team Leads (not just Admins) create/manage a share link for their own
--     team's projects — mirrors the app's WBS "manage" rule
--     (role = 'Team Lead' AND profiles.team_id = projects.team_id).
--  2) public_project_status: also return `lastUpdated` (latest wbs_items.updated_at)
--     so the public view can show a "Live · updated Xm ago" indicator. Priority /
--     dev comments / assignee stay hidden from clients.
--
-- Idempotent — safe to re-run. Requires fixes16 (flat wbs_items) already applied.

-- ============================================================
-- 1) client_links RLS — Admin OR Team Lead of the project's team
-- ============================================================
drop policy if exists "client_links_admin" on client_links;
drop policy if exists "client_links_manage" on client_links;
create policy "client_links_manage" on client_links
  for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.projects p
      join public.profiles me on me.id = auth.uid()
      where p.id = client_links.project_id
        and me.role = 'Team Lead'
        and me.team_id is not null
        and me.team_id = p.team_id
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.projects p
      join public.profiles me on me.id = auth.uid()
      where p.id = client_links.project_id
        and me.role = 'Team Lead'
        and me.team_id is not null
        and me.team_id = p.team_id
    )
  );

-- ============================================================
-- 2) public_project_status — add lastUpdated (data freshness)
--    (identical to fixes16 otherwise; priority stays hidden)
-- ============================================================
create or replace function public.public_project_status(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lnk record;
  proj record;
begin
  select * into lnk from public.client_links where token = p_token;
  if lnk is null then return null; end if;
  select id, name, type, wbs_enabled from public.projects where id = lnk.project_id into proj;
  if proj is null then return null; end if;

  return jsonb_build_object(
    'project', jsonb_build_object('name', proj.name, 'type', proj.type),
    'wbsEnabled', proj.wbs_enabled,
    'showOpenBugs', lnk.show_open_bugs,
    'lastUpdated', (select max(i.updated_at) from public.wbs_items i where i.project_id = proj.id),
    'wbs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'platform', i.platform_type, 'section', i.module, 'type', i.type,
        'name', i.title, 'status', i.status, 'est', i.estimated_completion_date,
        'position', i.position
      ) order by i.position), '[]'::jsonb)
      from public.wbs_items i where i.project_id = proj.id
    ),
    'wbsProgress', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where i.status = 'completed') / count(*)) end
      from public.wbs_items i where i.project_id = proj.id and i.type <> 'milestone'
    ),
    'releases', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'version', r.version, 'platform', r.platform, 'environment', r.environment,
        'component', r.component, 'status', r.status, 'date', r.date, 'notes', r.release_notes
      ) order by r.date desc, r.created_at desc), '[]'::jsonb)
      from public.releases r where r.project_id = proj.id and r.status <> 'closed'
    ),
    'bugs', (
      select jsonb_build_object(
        'open', count(*) filter (where b.status <> 'verified'),
        'resolved', count(*) filter (where b.status = 'verified')
      )
      from public.bugs b
      join public.releases r2 on r2.id = b.release_id
      where r2.project_id = proj.id and r2.status <> 'closed'
    )
  );
end;
$$;
revoke all on function public.public_project_status(text) from public;
grant execute on function public.public_project_status(text) to anon, authenticated;
