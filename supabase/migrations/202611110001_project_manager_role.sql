-- ============================================================
-- New role: Project Manager (PM).
--
-- A PM manages every project on the platform. They never belong to a team and
-- are never a project member; their rights come from the role alone.
--   * see every project, build, bug, task, document and the time logged on it
--   * create, edit and delete projects, and move a project to another team
--   * edit QA checklists, the client link, links, documents and every saved
--     password (including "Managers only" ones) and its access log
--   * add and remove project members (Developers, QA, Team Leads; not PMs)
--   * plan and update WBS work and CMS tasks
--   * decide on builds and bugs like a Team Lead: assign QA, approve, send
--     back, close, report bugs, verify a developer's proposed close
-- A PM can't change anyone's role or team, manage users, teams or brands, or
-- submit builds. Only an Admin gives someone the PM role.
--
-- Also: Team Leads can now edit QA checklists on their own team's projects.
-- The app showed them the button, but the database only allowed Admins.
--
-- Nearly every rule already goes through manages_project(), so most of this is
-- that one function.
-- ============================================================

-- ---------- the core rule ----------
create or replace function public.manages_project(p_project uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.my_role() = 'Project Manager'
      or exists (
        select 1 from public.projects p
        where p.id = p_project and public.my_role() = 'Team Lead' and p.team_id = public.my_team()
      );
$$;

-- ---------- rules that named the Team Lead or Admin directly ----------
-- client link: the project's managers (was Admin + the team's Team Lead)
drop policy if exists "client_links_manage" on public.client_links;
create policy "client_links_manage" on public.client_links to authenticated
  using (public.manages_project(project_id))
  with check (public.manages_project(project_id));

-- reporting bugs: QA, Team Leads, Admins and now Project Managers
drop policy if exists "bugs_insert" on public.bugs;
create policy "bugs_insert" on public.bugs for insert to authenticated
  with check (public.my_role() = any (array['QA', 'Team Lead', 'Admin', 'Project Manager']));

-- creating projects: Admins and PMs for any team, a Team Lead for their own team
drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects for insert to authenticated
  with check (
    public.is_admin()
    or public.my_role() = 'Project Manager'
    or (public.my_role() = 'Team Lead' and team_id = public.my_team())
  );

-- deleting projects: Admins and PMs
drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects for delete to authenticated
  using (public.is_admin() or public.my_role() = 'Project Manager');

-- QA checklists: the project's managers (was Admins only)
drop policy if exists "checklist_items_write" on public.checklist_items;
create policy "checklist_items_write" on public.checklist_items to authenticated
  using (public.manages_project(project_id))
  with check (public.manages_project(project_id));

-- moving bugs onto a new build: the build's submitter or QA, or the project's managers
CREATE OR REPLACE FUNCTION "public"."move_bugs_to_release"("p_to_release" "uuid", "p_prior_ids" "uuid"[], "p_moved_by" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_moved int := 0;
  v_pending int := 0;
  v_unresolved int := 0;
begin
  -- authz: caller must own / QA / manage the TARGET release (never trust p_moved_by)
  if not (
    public.is_admin()
    or exists (
      select 1 from public.releases r
      left join public.projects pr on pr.id = r.project_id
      where r.id = p_to_release
        and ( r.submitted_by_id = auth.uid()
           or r.assigned_qa = auth.uid()
           or public.manages_project(r.project_id) )
    )
  ) then
    raise exception 'Not authorized to move bugs onto this release';
  end if;

  if p_to_release is null or p_prior_ids is null or array_length(p_prior_ids, 1) is null then
    return jsonb_build_object('moved', 0, 'pendingVerify', 0, 'unresolved', 0);
  end if;

  -- integrity: every prior must belong to the SAME stream (project + platform +
  -- component) as the target. Without this, an authorized submitter of release B
  -- could pass arbitrary prior UUIDs and close + raid the bugs of unrelated
  -- releases in other projects. This mirrors the app's own "priors" selection.
  if exists (
    select 1 from public.releases r, public.releases t
    where t.id = p_to_release and r.id = any(p_prior_ids)
      and ( r.project_id is distinct from t.project_id
         or r.platform   is distinct from t.platform
         or coalesce(r.component,'') is distinct from coalesce(t.component,'') )
  ) then
    raise exception 'Prior releases must be in the same project/platform stream as the target';
  end if;

  update releases set status = 'closed', closed_at = now()
    where id = any(p_prior_ids) and status <> 'closed';

  with moved as (
    update bugs b
      set release_id = p_to_release,
          carried_forward = true,
          iteration = coalesce(b.iteration, 1) + 1,
          carried_from_release_id = b.release_id,
          status = case when b.status = 'fixed' then 'fixed' else 'open' end,
          resolution = null,
          resolution_by_id = null,
          resolution_note = null,
          resolution_at = null
      where b.release_id = any(p_prior_ids)
        and b.status <> 'verified'
        and b.release_id <> p_to_release
      returning b.id, b.status
  ),
  hist as (
    insert into bug_history (bug_id, release_id, action, new_status, moved_by, notes)
    -- attribute to the authenticated caller, not the client-supplied p_moved_by
    -- (which could be spoofed); fall back to p_moved_by only for service-role calls
    -- where auth.uid() is null.
    select m.id, p_to_release, 'carried_forward', m.status, coalesce(auth.uid(), p_moved_by), 'Moved from a superseded build'
    from moved m
    returning 1
  )
  select count(*),
         count(*) filter (where status = 'fixed'),
         count(*) filter (where status = 'open')
    into v_moved, v_pending, v_unresolved
    from moved;

  return jsonb_build_object('moved', v_moved, 'pendingVerify', v_pending, 'unresolved', v_unresolved);
end;
$$;

-- ---------- roles ----------
-- Only an Admin may grant or remove Project Manager (a Team Lead still only
-- moves their own team's people between Developer and QA).
create or replace function public.enforce_role_change() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    select role, team_id into caller_role, caller_team
      from public.profiles where id = auth.uid();
    if caller_role = 'Admin' then
      return new; -- admins may grant any role
    end if;
    if caller_role = 'Team Lead'
       and old.role in ('Developer','QA')
       and new.role in ('Developer','QA')
       and old.team_id is not distinct from caller_team then
      return new;
    end if;
    raise exception 'Only admins may grant the Admin, Team Lead or Project Manager roles';
  end if;
  return new;
end;
$$;

-- A Project Manager never belongs to a team: becoming one clears the team, and a
-- PM can't be given one. Runs after the role checks above.
create or replace function public.pm_has_no_team() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'Project Manager' then
    new.team_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_pm_no_team on public.profiles;
create trigger profiles_pm_no_team
  before insert or update on public.profiles
  for each row execute function public.pm_has_no_team();

-- ...and is never a project member (they manage every project without one).
-- Making someone a PM removes their project memberships.
create or replace function public.pm_not_a_member() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (select role from public.profiles where id = new.user_id) = 'Project Manager' then
    raise exception 'A Project Manager manages every project and can''t be added as a project member';
  end if;
  return new;
end;
$$;

drop trigger if exists project_members_no_pm on public.project_members;
create trigger project_members_no_pm
  before insert or update on public.project_members
  for each row execute function public.pm_not_a_member();

create or replace function public.pm_drop_memberships() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'Project Manager' and old.role is distinct from new.role then
    delete from public.project_members where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_pm_drop_memberships on public.profiles;
create trigger profiles_pm_drop_memberships
  after update on public.profiles
  for each row execute function public.pm_drop_memberships();

revoke all on function public.pm_has_no_team() from public, anon;
revoke all on function public.pm_not_a_member() from public, anon;
revoke all on function public.pm_drop_memberships() from public, anon;
