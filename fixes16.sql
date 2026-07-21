-- fixes16.sql — Flat WBS Items (replace the platform→module→task hierarchy).
--
-- BACK UP FIRST and run on a STAGING copy. DESTRUCTIVE: drops wbs_platforms and
-- wbs_modules. wbs_tasks is ALREADY the flat item table (platform/module are
-- denormalized text on it), so we evolve it IN PLACE: rename wbs_tasks → wbs_items
-- so release_tasks.task_id and bugs.wbs_task_id (same row ids) are preserved with
-- zero re-pointing. The two-track backend/frontend status collapses to one status.
--
-- Idempotent — every step is guarded, safe to re-run.

-- ============================================================
-- 1) projects — new fields
-- ============================================================
alter table projects add column if not exists project_type text;   -- mobile_app | web_app | admin_panel | other
alter table projects add column if not exists completion_date date;
alter table projects add column if not exists deployment_date date;
update projects set project_type = case
    when type = 'mobile' then 'mobile_app'
    when type = 'web' then 'web_app'
    else 'other'
  end
  where project_type is null;

-- ============================================================
-- 2) releases — replace the wbs_platform_id FK with a free-text tag
--    (guarded: wbs_platforms / releases.wbs_platform_id only exist if the old
--     fixes11.sql hierarchy migration was ever applied)
-- ============================================================
alter table releases add column if not exists wbs_platform_type text;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'wbs_platforms')
     and exists (select 1 from information_schema.columns where table_name = 'releases' and column_name = 'wbs_platform_id') then
    execute $q$
      update releases r set wbs_platform_type = p.name
      from wbs_platforms p
      where p.id = r.wbs_platform_id and r.wbs_platform_type is null
    $q$;
  end if;
end $$;

-- ============================================================
-- 3) Evolve wbs_tasks → wbs_items
-- ============================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'wbs_tasks')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'wbs_items') then
    alter table wbs_tasks rename to wbs_items;
  elsif not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'wbs_items') then
    -- no WBS ever existed on this database: create the flat table fresh
    create table wbs_items (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      import_key text not null default ('portal:' || gen_random_uuid()::text),
      platform_type text,
      module text default '',
      type text not null default 'task',
      title text not null,
      dev_comments text default '',
      estimated_completion_date text default '',
      position int not null default 0,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

-- new columns
alter table wbs_items add column if not exists description text default '';
alter table wbs_items add column if not exists status text not null default 'not_started';  -- not_started|in_progress|in_qa|completed|blocked
alter table wbs_items add column if not exists assigned_to uuid references profiles(id) on delete set null;
alter table wbs_items add column if not exists priority text;                                -- Low | Medium | High
alter table wbs_items add column if not exists actual_completion_date timestamptz;
alter table wbs_items add column if not exists updated_at timestamptz not null default now();

-- renames (platform/section/name/est_date → the flat-item vocabulary)
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='wbs_items' and column_name='platform') then
    alter table wbs_items rename column platform to platform_type;
  end if;
  if exists (select 1 from information_schema.columns where table_name='wbs_items' and column_name='section') then
    alter table wbs_items rename column section to module;
  end if;
  if exists (select 1 from information_schema.columns where table_name='wbs_items' and column_name='name') then
    alter table wbs_items rename column name to title;
  end if;
  if exists (select 1 from information_schema.columns where table_name='wbs_items' and column_name='est_date') then
    alter table wbs_items rename column est_date to estimated_completion_date;
  end if;
end $$;

-- collapse the two tracks into one status (strict: completed only if BOTH done)
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='wbs_items' and column_name='backend_status') then
    update wbs_items set status = case
      when backend_status = 'complete' and frontend_status = 'complete' then 'completed'
      when backend_status = 'in_qa' or frontend_status = 'in_qa' then 'in_qa'
      when backend_status = 'in_progress' or frontend_status = 'in_progress' then 'in_progress'
      else 'not_started'
    end;
  end if;
end $$;

-- drop the old two-track + hierarchy FK columns
alter table wbs_items drop column if exists backend_status;
alter table wbs_items drop column if exists frontend_status;
alter table wbs_items drop column if exists platform_id;
alter table wbs_items drop column if exists module_id;

create index if not exists wbs_items_project_idx on wbs_items (project_id);
create index if not exists wbs_items_platform_type_idx on wbs_items (project_id, platform_type);

-- ensure RLS + grants + policy (idempotent; covers both the renamed and fresh table)
alter table wbs_items enable row level security;
grant select, insert, update, delete on wbs_items to authenticated;
drop policy if exists "wbs_items_all" on wbs_items;
create policy "wbs_items_all" on wbs_items for all to authenticated using (true) with check (true);

-- ============================================================
-- 4) Drop the hierarchy tables (releases FK removed first)
-- ============================================================
alter table releases drop column if exists wbs_platform_id;
drop table if exists wbs_modules;
drop table if exists wbs_platforms;

-- ============================================================
-- 5) Rewrite public_project_status — flat wbs + single overall progress
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

-- ============================================================
-- 6) Verify (raises a notice — check output)
-- ============================================================
do $$
declare rel_links int; bug_links int;
begin
  select count(*) into rel_links from release_tasks where task_id is not null;
  select count(*) into bug_links from bugs where wbs_task_id is not null;
  raise notice 'fixes16 verify: % release_task links, % bug links preserved', rel_links, bug_links;
end $$;
