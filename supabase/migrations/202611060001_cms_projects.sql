-- ============================================================
-- CMS projects: websites, landing pages and API integrations.
--
-- A CMS project is projects.type = 'cms'. It has no WBS. Its work is tracked as
--   cms_tasks   one request at a time (changes, recovery, blogs, SEO, …), each
--               with who asked for it (AM / PMO / SEO) and where (Basecamp / CRM / Group)
--   cms_stages  the development journey of a new build, template selection → handover.
--               Rows exist only once someone starts the journey for the project.
-- ============================================================

alter table public.projects
  add column if not exists cms_kind text;

alter table public.projects drop constraint if exists projects_cms_kind_chk;
alter table public.projects add constraint projects_cms_kind_chk
  check (cms_kind is null or cms_kind in ('website', 'api_integration'));

-- a CMS project never has a WBS
create or replace function public.projects_cms_no_wbs() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.type = 'cms' then
    new.wbs_enabled := false;
    new.cms_kind := coalesce(new.cms_kind, 'website');
  else
    new.cms_kind := null;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_cms_no_wbs on public.projects;
create trigger projects_cms_no_wbs before insert or update of type, wbs_enabled, cms_kind on public.projects
  for each row execute function public.projects_cms_no_wbs();

-- who can add / change CMS work: managers, project members, and the owning team
create or replace function public.can_work_cms_project(p_project uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.can_write() and (
    public.manages_project(p_project)
    or public.is_project_member(p_project)
    or (select team_id from public.projects where id = p_project) = public.my_team()
  );
$$;
revoke all on function public.can_work_cms_project(uuid) from public, anon;
grant execute on function public.can_work_cms_project(uuid) to authenticated, service_role;

-- ---------- tasks ----------
create table if not exists public.cms_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in (
    'existing_changes', 'major_functionality', 'recovery', 'blogs', 'seo_speed', 'app_landing', 'api_integration'
  )),
  title text not null check (length(trim(title)) > 0),
  details text not null default '',
  requested_by text not null check (requested_by in ('am', 'pmo', 'seo')),
  channel text check (channel is null or channel in ('basecamp', 'crm', 'group', 'other')),
  reference_url text check (reference_url is null or reference_url ~* '^https?://'),
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text check (priority is null or priority in ('Low', 'Medium', 'High')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'in_review', 'done', 'on_hold')),
  due_date date,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cms_tasks_project_idx on public.cms_tasks (project_id, status);
create index if not exists cms_tasks_assignee_idx on public.cms_tasks (assigned_to) where assigned_to is not null;

-- keep completed_at / updated_at honest whatever the client sends
create or replace function public.cms_tasks_touch() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists cms_tasks_touch on public.cms_tasks;
create trigger cms_tasks_touch before insert or update on public.cms_tasks
  for each row execute function public.cms_tasks_touch();

alter table public.cms_tasks enable row level security;

drop policy if exists "cms_tasks_select" on public.cms_tasks;
create policy "cms_tasks_select" on public.cms_tasks for select to authenticated
  using (public.can_view_project_info(project_id));
drop policy if exists "cms_tasks_insert" on public.cms_tasks;
create policy "cms_tasks_insert" on public.cms_tasks for insert to authenticated
  with check (public.can_work_cms_project(project_id));
drop policy if exists "cms_tasks_update" on public.cms_tasks;
create policy "cms_tasks_update" on public.cms_tasks for update to authenticated
  using (public.can_work_cms_project(project_id)) with check (public.can_work_cms_project(project_id));
drop policy if exists "cms_tasks_delete" on public.cms_tasks;
create policy "cms_tasks_delete" on public.cms_tasks for delete to authenticated
  using (public.manages_project(project_id) or (created_by = auth.uid() and public.can_work_cms_project(project_id)));

revoke all on public.cms_tasks from anon;
grant select, insert, update, delete on public.cms_tasks to authenticated;
grant all on public.cms_tasks to service_role;

-- ---------- development journey ----------
create table if not exists public.cms_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null check (stage in (
    'template_selection', 'landing_development', 'subpages', 'prelaunch_api', 'review_revisions',
    'prelaunch_qa', 'deployment', 'postlaunch_api', 'handover'
  )),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  owner_id uuid references public.profiles(id) on delete set null,
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  notes text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (project_id, stage)
);

create or replace function public.cms_stages_touch() returns trigger
  language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
    new.started_at := coalesce(new.started_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  if new.status = 'pending' then
    new.started_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists cms_stages_touch on public.cms_stages;
create trigger cms_stages_touch before insert or update on public.cms_stages
  for each row execute function public.cms_stages_touch();

alter table public.cms_stages enable row level security;

drop policy if exists "cms_stages_select" on public.cms_stages;
create policy "cms_stages_select" on public.cms_stages for select to authenticated
  using (public.can_view_project_info(project_id));
drop policy if exists "cms_stages_insert" on public.cms_stages;
create policy "cms_stages_insert" on public.cms_stages for insert to authenticated
  with check (public.can_work_cms_project(project_id));
drop policy if exists "cms_stages_update" on public.cms_stages;
create policy "cms_stages_update" on public.cms_stages for update to authenticated
  using (public.can_work_cms_project(project_id)) with check (public.can_work_cms_project(project_id));
drop policy if exists "cms_stages_delete" on public.cms_stages;
create policy "cms_stages_delete" on public.cms_stages for delete to authenticated
  using (public.manages_project(project_id));

revoke all on public.cms_stages from anon;
grant select, insert, update, delete on public.cms_stages to authenticated;
grant all on public.cms_stages to service_role;
