-- ============================================================
-- Run once in the Supabase SQL editor.
-- 1) admin team create/delete RPCs   2) signup role = Developer/QA only
-- 3) bug comment threads
-- ============================================================

-- ------------------------------------------------------------
-- 1) Teams: admin-only create/delete via SECURITY DEFINER RPCs
--    (reliable regardless of RLS/grants on the teams table).
-- ------------------------------------------------------------
create or replace function public.admin_create_team(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create teams';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Team name is required';
  end if;
  insert into public.teams (name) values (trim(p_name)) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.admin_create_team(text) from public, anon;
grant execute on function public.admin_create_team(text) to authenticated;

create or replace function public.admin_delete_team(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete teams';
  end if;
  delete from public.teams where id = p_id;
end;
$$;
revoke all on function public.admin_delete_team(uuid) from public, anon;
grant execute on function public.admin_delete_team(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2) Signup may only produce Developer or QA.
--    The very first account still bootstraps as Admin; Admin/Team Lead
--    are otherwise assigned later by an admin.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  existing int;
  assigned_role text;
  meta_role text;
begin
  if lower(split_part(new.email, '@', 2)) <> 'jumppace.com' then
    raise exception 'Only @jumppace.com email addresses are allowed';
  end if;

  select count(*) into existing from public.profiles;
  meta_role := new.raw_user_meta_data->>'role';

  if existing = 0 then
    assigned_role := 'Admin';                 -- first user bootstrap
  elsif meta_role in ('Developer', 'QA') then
    assigned_role := meta_role;               -- self-selected at signup
  else
    assigned_role := 'Developer';             -- safe default
  end if;

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
          assigned_role);
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3) Bug comment threads
-- ------------------------------------------------------------
create table if not exists bug_comments (
  id uuid primary key default gen_random_uuid(),
  bug_id uuid not null references bugs(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  author_name text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table bug_comments enable row level security;
grant select, insert, update, delete on table bug_comments to authenticated;

drop policy if exists "bug_comments_all" on bug_comments;
create policy "bug_comments_all" on bug_comments
  for all to authenticated using (true) with check (true);
