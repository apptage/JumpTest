-- ============================================================
-- Structured release lifecycle + release chaining + bug lineage.
-- Run once in the Supabase SQL editor. Idempotent where possible.
-- ============================================================

-- 1) Release chaining / closed state -------------------------------------
alter table releases add column if not exists supersedes_release_id uuid references releases(id) on delete set null;
alter table releases add column if not exists closed_at timestamptz;
create index if not exists releases_supersedes_idx on releases (supersedes_release_id);

-- 2) Migrate existing release statuses to the new lifecycle ---------------
--    pending → qa_pending, in_qa → qa_in_progress,
--    qa_complete → approved, bug_repeat → sent_back
update releases set status = 'qa_pending'      where status = 'pending';
update releases set status = 'qa_in_progress'  where status = 'in_qa';
update releases set status = 'approved'        where status = 'qa_complete';
update releases set status = 'sent_back'        where status = 'bug_repeat';
alter table releases alter column status set default 'qa_pending';

-- 3) Bug lineage / carry-forward -----------------------------------------
alter table bugs add column if not exists bug_key uuid;
alter table bugs add column if not exists origin_release_id uuid references releases(id) on delete set null;
alter table bugs add column if not exists carried_from_release_id uuid references releases(id) on delete set null;
alter table bugs add column if not exists carried_forward boolean not null default false;
alter table bugs add column if not exists iteration int not null default 1;
alter table bugs add column if not exists verified_at timestamptz;
alter table bugs add column if not exists verified_by_id uuid;

-- backfill stable identity for existing bugs
update bugs set bug_key = gen_random_uuid() where bug_key is null;
update bugs set origin_release_id = release_id where origin_release_id is null;
alter table bugs alter column bug_key set default gen_random_uuid();

create index if not exists bugs_bug_key_idx on bugs (bug_key);
create index if not exists bugs_carried_from_idx on bugs (carried_from_release_id);

-- 4) Public status RPC: exclude closed (superseded) releases so carried bugs
--    aren't double-counted and clients don't see archived iterations.
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
