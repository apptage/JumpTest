-- ============================================================
-- Release Tracker — full Supabase setup (v2)
-- Run this entire file in the Supabase SQL editor.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT.
-- ============================================================

-- ------------------------------------------------------------
-- profiles (one row per auth user)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null,
  role text not null default 'Developer',
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

-- ------------------------------------------------------------
-- projects (admin-managed)
-- ------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,            -- 'mobile' | 'web'
  platform text not null,        -- 'Android' | 'iOS' | 'Web' | 'Both'
  created_at timestamptz not null default now()
);
alter table projects enable row level security;

-- ------------------------------------------------------------
-- releases
-- ------------------------------------------------------------
create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  version text not null,
  release_type text not null default 'apk',  -- 'apk' | 'testflight' | 'web'
  platform text not null default 'Both',
  file_url text default '',                   -- APK public URL (Storage)
  link_url text default '',                   -- TestFlight / Web link
  submitted_by text not null,
  submitted_by_role text not null,
  submitted_by_id uuid references profiles(id) on delete set null,
  assigned_qa uuid references profiles(id) on delete set null,
  date date not null default current_date,
  release_notes text not null default '',
  status text not null default 'pending',     -- pending | in_qa | qa_complete | bug_repeat
  qa_note text default '',
  qa_completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table releases enable row level security;

-- upgrade older releases tables (no-ops if columns already exist)
alter table releases add column if not exists project_id uuid references projects(id) on delete set null;
alter table releases add column if not exists release_type text not null default 'apk';
alter table releases add column if not exists file_url text default '';
alter table releases add column if not exists link_url text default '';
alter table releases add column if not exists submitted_by_id uuid references profiles(id) on delete set null;
alter table releases add column if not exists assigned_qa uuid references profiles(id) on delete set null;
alter table releases add column if not exists qa_completed_at timestamptz;
alter table releases add column if not exists created_at timestamptz not null default now();
-- drop the legacy v1 column (replaced by release_type); its NOT NULL blocks inserts
alter table releases drop column if exists "type";

-- ------------------------------------------------------------
-- bugs (QA -> Developer)
-- ------------------------------------------------------------
create table if not exists bugs (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  title text not null,
  description text not null default '',
  severity text not null default 'major',   -- critical | major | minor
  screenshot_url text default '',
  status text not null default 'open',       -- open | in_progress | fixed | verified
  created_by text not null,
  created_by_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table bugs enable row level security;

-- ------------------------------------------------------------
-- comments (threaded, one level of replies)
-- ------------------------------------------------------------
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  author_name text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table comments enable row level security;

-- ------------------------------------------------------------
-- notifications (in-app bell)
-- ------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  message text not null,
  release_id uuid references releases(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table notifications enable row level security;

-- ------------------------------------------------------------
-- checklist templates (per project) + per-release check state
-- ------------------------------------------------------------
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table checklist_items enable row level security;

create table if not exists release_checklist (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  item_id uuid not null references checklist_items(id) on delete cascade,
  checked boolean not null default false,
  unique (release_id, item_id)
);
alter table release_checklist enable row level security;

-- ------------------------------------------------------------
-- helpers + triggers (admin check, signup profile, role guard)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'Admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing int; assigned_role text;
begin
  if lower(split_part(new.email, '@', 2)) <> 'jumppace.com' then
    raise exception 'Only @jumppace.com email addresses are allowed';
  end if;
  select count(*) into existing from public.profiles;
  assigned_role := case when existing = 0 then 'Admin' else 'Developer' end;
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
          assigned_role);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.enforce_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_guard on profiles;
create trigger profiles_role_guard before update on profiles
  for each row execute function public.enforce_role_change();

-- ------------------------------------------------------------
-- RLS policies — authenticated users can read/write app data;
-- role rules are enforced in the app (trust-based internal tool).
-- profiles role changes stay protected by the guard trigger above.
-- ------------------------------------------------------------
do $$
declare
  t text;
  tbls text[] := array['releases','projects','bugs','comments','notifications','checklist_items','release_checklist'];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists "%s_all" on %I', t, t);
    execute format(
      'create policy "%s_all" on %I for all to authenticated using (true) with check (true)',
      t, t);
  end loop;
end $$;

-- profiles policies
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_update_self" on profiles;
drop policy if exists "profiles_update_admin" on profiles;
drop policy if exists "profiles_delete_admin" on profiles;
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update_self" on profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_update_admin" on profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "profiles_delete_admin" on profiles for delete to authenticated
  using (public.is_admin() and auth.uid() <> id);

-- ------------------------------------------------------------
-- Storage buckets (public) + upload policies
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('apks', 'apks', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('screenshots', 'screenshots', true)
  on conflict (id) do update set public = true;

drop policy if exists "uploads_read" on storage.objects;
drop policy if exists "uploads_insert" on storage.objects;
drop policy if exists "uploads_update" on storage.objects;
drop policy if exists "uploads_delete" on storage.objects;

create policy "uploads_read" on storage.objects for select
  using (bucket_id in ('apks', 'screenshots'));
create policy "uploads_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('apks', 'screenshots'));
create policy "uploads_update" on storage.objects for update to authenticated
  using (bucket_id in ('apks', 'screenshots'));
create policy "uploads_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('apks', 'screenshots'));
