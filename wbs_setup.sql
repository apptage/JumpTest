-- ============================================================
-- WBS (Work Breakdown Structure) — run once in the Supabase SQL editor.
-- Optional per-project. Non-WBS projects are completely unaffected.
-- ============================================================

alter table projects add column if not exists wbs_enabled boolean not null default false;

-- WBS tasks (flat rows; tree is built from platform/section/type)
create table if not exists wbs_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  import_key text not null,                       -- stable id across re-imports
  platform text,                                  -- 'Mobile' | 'Web' | null
  section text default '',                        -- module / section name
  type text not null default 'task',              -- 'section' | 'task' | 'milestone'
  name text not null,
  dev_comments text default '',                   -- internal only; hidden from clients
  backend_status text not null default 'not_started',   -- not_started|in_progress|in_qa|complete
  frontend_status text not null default 'not_started',
  est_date text default '',
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, import_key)
);
alter table wbs_tasks enable row level security;
grant select, insert, update, delete on wbs_tasks to authenticated;
drop policy if exists "wbs_tasks_all" on wbs_tasks;
create policy "wbs_tasks_all" on wbs_tasks for all to authenticated using (true) with check (true);

-- Release ↔ WBS task links, with name snapshots so history never changes
create table if not exists release_tasks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references releases(id) on delete cascade,
  task_id uuid references wbs_tasks(id) on delete set null,
  task_name text not null,
  track text not null default 'both',             -- 'backend' | 'frontend' | 'both'
  created_at timestamptz not null default now()
);
alter table release_tasks enable row level security;
grant select, insert, update, delete on release_tasks to authenticated;
drop policy if exists "release_tasks_all" on release_tasks;
create policy "release_tasks_all" on release_tasks for all to authenticated using (true) with check (true);

-- Public read-only status: now also returns the WBS for WBS-enabled projects
-- (developer comments are never included).
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
        'platform', t.platform, 'section', t.section, 'type', t.type, 'name', t.name,
        'backend', t.backend_status, 'frontend', t.frontend_status, 'est', t.est_date,
        'position', t.position
      ) order by t.position), '[]'::jsonb)
      from public.wbs_tasks t where t.project_id = proj.id
    ),
    'releases', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'version', r.version, 'platform', r.platform, 'environment', r.environment,
        'component', r.component, 'status', r.status, 'date', r.date, 'notes', r.release_notes
      ) order by r.date desc, r.created_at desc), '[]'::jsonb)
      from public.releases r where r.project_id = proj.id
    ),
    'bugs', (
      select jsonb_build_object(
        'open', count(*) filter (where b.status <> 'verified'),
        'resolved', count(*) filter (where b.status = 'verified')
      )
      from public.bugs b
      join public.releases r2 on r2.id = b.release_id
      where r2.project_id = proj.id
    )
  );
end;
$$;
revoke all on function public.public_project_status(text) from public;
grant execute on function public.public_project_status(text) to anon, authenticated;
