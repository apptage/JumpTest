-- ============================================================
-- Close an old hole in team permissions.
--
-- "teams_all" let any signed-in user create, rename or delete any team. The app
-- only changes teams through admin_create_team / admin_delete_team, which check
-- for an Admin and run with their own rights, so they're unaffected.
--   read                    everyone signed in (the app lists teams everywhere)
--   add / rename / delete   Admins only
-- ============================================================

drop policy if exists "teams_all" on public.teams;

drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select to authenticated using (true);

drop policy if exists "teams_admin_write" on public.teams;
create policy "teams_admin_write" on public.teams for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
