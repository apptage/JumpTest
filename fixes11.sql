-- ============================================================
-- WBS multi-platform + in-portal structural editing.
-- Introduces first-class platform/module entities (with ordering),
-- scopes releases to a WBS platform, backfills from the existing flat
-- wbs_tasks, and extends the public status RPC with a structured tree.
-- Idempotent. Run once in the Supabase SQL editor.
-- ============================================================

-- 1) Platform entity (per project). Inferred from import but editable. -------
create table if not exists wbs_platforms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,                 -- editable display name ('Mobile App', 'Admin Dashboard')
  import_platform text,               -- original sheet-derived platform text (stable re-import match key)
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);
create index if not exists wbs_platforms_project_idx on wbs_platforms (project_id);
create index if not exists wbs_platforms_import_idx on wbs_platforms (project_id, import_platform);
alter table wbs_platforms enable row level security;
grant select, insert, update, delete on wbs_platforms to authenticated;
drop policy if exists "wbs_platforms_all" on wbs_platforms;
create policy "wbs_platforms_all" on wbs_platforms for all to authenticated using (true) with check (true);

-- 2) Module entity (per platform). ------------------------------------------
create table if not exists wbs_modules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  platform_id uuid not null references wbs_platforms(id) on delete cascade,
  name text not null,                 -- editable module/section name
  import_section text,                -- original sheet-derived section text (stable re-import match key)
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (platform_id, name)
);
create index if not exists wbs_modules_project_idx on wbs_modules (project_id);
create index if not exists wbs_modules_platform_idx on wbs_modules (platform_id);
create index if not exists wbs_modules_import_idx on wbs_modules (platform_id, import_section);
alter table wbs_modules enable row level security;
grant select, insert, update, delete on wbs_modules to authenticated;
drop policy if exists "wbs_modules_all" on wbs_modules;
create policy "wbs_modules_all" on wbs_modules for all to authenticated using (true) with check (true);

-- 3) Wire wbs_tasks to the entities. Keep platform/section text as a cache. --
alter table wbs_tasks add column if not exists platform_id uuid references wbs_platforms(id) on delete set null;
alter table wbs_tasks add column if not exists module_id   uuid references wbs_modules(id)   on delete set null;
create index if not exists wbs_tasks_platform_idx on wbs_tasks (platform_id);
create index if not exists wbs_tasks_module_idx on wbs_tasks (module_id);

-- 4) Scope releases to a WBS platform (additive; releases.platform stays). ---
alter table releases add column if not exists wbs_platform_id uuid references wbs_platforms(id) on delete set null;
create index if not exists releases_wbs_platform_idx on releases (wbs_platform_id);

-- 5) Backfill from existing flat wbs_tasks (idempotent). --------------------
-- 5a) platforms from distinct task.platform (null -> 'General' bucket)
insert into wbs_platforms (project_id, name, import_platform, position)
select project_id,
       coalesce(platform, 'General'),
       platform,
       dense_rank() over (partition by project_id order by coalesce(platform, '~zzz')) - 1
from (select distinct project_id, platform from wbs_tasks) d
on conflict (project_id, name) do nothing;

-- 5b) modules from distinct (platform, section) of non-milestone tasks
insert into wbs_modules (project_id, platform_id, name, import_section, position)
select t.project_id, p.id,
       coalesce(nullif(t.section, ''), 'General'),
       t.section,
       row_number() over (partition by p.id order by min(t.position)) - 1
from wbs_tasks t
join wbs_platforms p
  on p.project_id = t.project_id
 and p.import_platform is not distinct from t.platform
where t.type <> 'milestone'
group by t.project_id, p.id, t.section
on conflict (platform_id, name) do nothing;

-- 5c) set platform_id on every task
update wbs_tasks t
set platform_id = p.id
from wbs_platforms p
where p.project_id = t.project_id
  and p.import_platform is not distinct from t.platform
  and t.platform_id is null;

-- 5d) set module_id on non-milestone tasks (milestones stay module-less)
update wbs_tasks t
set module_id = m.id
from wbs_modules m
where m.platform_id = t.platform_id
  and m.import_section is not distinct from t.section
  and t.type <> 'milestone'
  and t.module_id is null;

-- 6) Public status RPC: keep flat `wbs` (client unchanged) + add `wbsTree`. --
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
    'wbsTree', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'platform', pf.name,
        'platformId', pf.id,
        'position', pf.position,
        'progress', (
          select case when count(*) = 0 then 0 else round(100.0 * (
            count(*) filter (where t.backend_status = 'complete') +
            count(*) filter (where t.frontend_status = 'complete')
          ) / (2 * count(*))) end
          from public.wbs_tasks t
          where t.platform_id = pf.id and t.type <> 'milestone'
        ),
        'modules', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'module', m.name, 'position', m.position,
            'tasks', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'name', t.name, 'type', t.type, 'backend', t.backend_status,
                'frontend', t.frontend_status, 'est', t.est_date, 'position', t.position
              ) order by t.position), '[]'::jsonb)
              from public.wbs_tasks t
              where t.module_id = m.id and t.type <> 'milestone'
            )
          ) order by m.position), '[]'::jsonb)
          from public.wbs_modules m where m.platform_id = pf.id
        ),
        'milestones', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', t.name, 'est', t.est_date, 'position', t.position
          ) order by t.position), '[]'::jsonb)
          from public.wbs_tasks t
          where t.platform_id = pf.id and t.type = 'milestone'
        )
      ) order by pf.position), '[]'::jsonb)
      from public.wbs_platforms pf where pf.project_id = proj.id
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
revoke all on function public.public_project_status(text) from public;
grant execute on function public.public_project_status(text) to anon, authenticated;
