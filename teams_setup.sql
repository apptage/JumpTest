-- ============================================================
-- Teams & RBAC — run once in the Supabase SQL editor.
-- Adds teams, links users + projects to a team, and migrates
-- existing data into a default "Team A".
-- (Enforcement is app-level; policies stay permissive-authenticated.)
-- ============================================================

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table teams enable row level security;

alter table profiles add column if not exists team_id uuid references teams(id) on delete set null;
alter table projects add column if not exists team_id uuid references teams(id) on delete set null;

drop policy if exists "teams_all" on teams;
create policy "teams_all" on teams for all to authenticated using (true) with check (true);

-- Admins and Team Leads may manage member profiles (role + team).
create or replace function public.can_manage_roles()
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Admin', 'Team Lead')
  );
$$;

-- allow managers to update any profile row (role/team); app scopes who they edit
drop policy if exists "profiles_update_manager" on public.profiles;
create policy "profiles_update_manager" on public.profiles
  for update to authenticated
  using (public.can_manage_roles()) with check (public.can_manage_roles());

-- relax the role-change guard so Team Leads (not just Admins) can set roles
create or replace function public.enforce_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.can_manage_roles() then
    raise exception 'Only admins or team leads can change roles';
  end if;
  return new;
end;
$$;

-- migration: create "Team A" and assign all existing non-admin users
-- and all existing projects to it (Admins stay global / team-less).
do $$
declare t uuid;
begin
  select id into t from public.teams order by created_at limit 1;
  if t is null then
    insert into public.teams (name) values ('Team A') returning id into t;
  end if;
  update public.profiles set team_id = t where team_id is null and role <> 'Admin';
  update public.projects set team_id = t where team_id is null;
end $$;
