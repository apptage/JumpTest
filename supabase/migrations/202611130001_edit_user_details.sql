-- ============================================================
-- Editing a user's details (name, email) from Users / Team members.
--
--   Admin            anyone
--   Project Manager  anyone except an Admin
--   Team Lead        Developers and QA on their own team
--   anyone           their own details
--
-- Until now Admins and Team Leads could update any column of any profile
-- (profiles_update_manager); only role changes were checked. This adds the
-- Project Manager to the update rule and checks name, email and team changes:
--   * name / email: the scope above
--   * team: Admins only (a PM has no team and doesn't move people)
-- Role changes are still checked by enforce_role_change().
--
-- The login email lives in auth.users, so the app changes an email through the
-- admin-update-user Edge Function, which applies the same scope and updates
-- both. It runs as the service role (auth.uid() is null), which this skips.
-- ============================================================

drop policy if exists "profiles_update_pm" on public.profiles;
create policy "profiles_update_pm" on public.profiles for update to authenticated
  using (public.my_role() = 'Project Manager')
  with check (public.my_role() = 'Project Manager');

create or replace function public.enforce_profile_details() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_team uuid;
begin
  -- service role (Edge Functions, SQL editor) and your own profile: no extra check
  if auth.uid() is null or auth.uid() = old.id then
    return new;
  end if;

  select role, team_id into caller_role, caller_team
    from public.profiles where id = auth.uid();
  if caller_role = 'Admin' then
    return new;
  end if;

  if new.team_id is distinct from old.team_id then
    raise exception 'Only admins can move people between teams';
  end if;

  if new.name is distinct from old.name or new.email is distinct from old.email then
    if caller_role = 'Project Manager' and old.role <> 'Admin' then
      return new;
    end if;
    if caller_role = 'Team Lead'
       and old.role in ('Developer', 'QA')
       and caller_team is not null
       and old.team_id = caller_team then
      return new;
    end if;
    raise exception 'You can''t edit this person''s details';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_profile_details() from public, anon;

drop trigger if exists profiles_details_guard on public.profiles;
create trigger profiles_details_guard
  before update on public.profiles
  for each row execute function public.enforce_profile_details();
