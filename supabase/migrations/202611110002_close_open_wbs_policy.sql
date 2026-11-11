-- ============================================================
-- Close an old hole in WBS permissions.
--
-- "wbs_tasks_all" (left over from when the table was wbs_tasks) let any
-- signed-in user add, change or delete any project's WBS work. Policies are
-- OR-ed together, so it overrode the real rules below. It's removed here.
--
-- What's left, per project:
--   read     everyone signed in (unchanged)
--   add      the project's managers (Admin, its Team Lead, its Project Manager),
--            or anyone who can write who is on the project's team or a member of it
--   change   the same people. Developers and QA move work along when builds are
--            submitted and reviewed, so this includes members from other teams
--            (support access) and stays open to the whole team as before.
--   delete   the project's managers only (unchanged)
-- The read-only Manager role still can't write (can_write()).
-- ============================================================

drop policy if exists "wbs_tasks_all" on public.wbs_items;

drop policy if exists "wbs_items_insert" on public.wbs_items;
create policy "wbs_items_insert" on public.wbs_items for insert to authenticated
  with check (
    public.manages_project(project_id)
    or (public.can_write() and (
      (select p.team_id from public.projects p where p.id = wbs_items.project_id) = public.my_team()
      or public.is_project_member(project_id)))
  );

drop policy if exists "wbs_items_update" on public.wbs_items;
create policy "wbs_items_update" on public.wbs_items for update to authenticated
  using (
    public.manages_project(project_id)
    or (public.can_write() and (
      (select p.team_id from public.projects p where p.id = wbs_items.project_id) = public.my_team()
      or public.is_project_member(project_id)))
  )
  with check (
    public.manages_project(project_id)
    or (public.can_write() and (
      (select p.team_id from public.projects p where p.id = wbs_items.project_id) = public.my_team()
      or public.is_project_member(project_id)))
  );
