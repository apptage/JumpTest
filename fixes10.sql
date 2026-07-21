-- ============================================================
-- Project membership: the project (not the team) becomes the unit of access.
-- Supports temporary cross-team "support" grants with an expiry.
-- Run once in the Supabase SQL editor.
-- ============================================================

create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  project_role text not null default 'developer',  -- developer | qa | lead | viewer
  access_type text not null default 'home',        -- home | support (temporary guest)
  expires_at timestamptz,                           -- null = permanent; else access ends then
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (project_id, user_id)
);
create index if not exists project_members_user_idx on project_members (user_id);
create index if not exists project_members_project_idx on project_members (project_id);

-- App-tier enforcement for now: permissive RLS, same as the rest of the app.
alter table project_members enable row level security;
drop policy if exists "project_members_all" on project_members;
create policy "project_members_all" on project_members
  for all to authenticated using (true) with check (true);

-- Backfill: every existing (non-admin) profile becomes a HOME member of every
-- project in their current team, with a per-project role from their global role.
-- This preserves today's visibility on day one; leads then curate from here.
insert into project_members (project_id, user_id, project_role, access_type)
select p.id, pr.id,
       case pr.role
         when 'QA' then 'qa'
         when 'Team Lead' then 'lead'
         else 'developer'
       end,
       'home'
from projects p
join profiles pr on pr.team_id = p.team_id and pr.role <> 'Admin'
on conflict (project_id, user_id) do nothing;

-- ------------------------------------------------------------
-- OPTIONAL DB-tier enforcement (enable AFTER verifying app-tier behaviour).
-- Until you run the block below, isolation is enforced in the app only.
-- ------------------------------------------------------------
create or replace function public.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.project_members m
    where m.project_id = p_project
      and m.user_id = auth.uid()
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

-- To turn on real database isolation later, replace the permissive read
-- policies on releases / bugs / projects with membership-based ones, e.g.:
--
--   drop policy if exists "releases_all" on releases;
--   create policy "releases_read" on releases for select to authenticated
--     using (public.is_project_member(project_id));
--   create policy "releases_write" on releases for all to authenticated
--     using (public.is_project_member(project_id))
--     with check (public.is_project_member(project_id));
--
-- (Mirror for bugs via their release's project, and for projects via id.)
-- Do this only once the Members panel is populated, or users will lose access.
