-- ============================================================
-- Run once in the Supabase SQL editor.
-- Public, read-only client project dashboard via a share token.
-- ============================================================

create table if not exists client_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  show_open_bugs boolean not null default false,
  created_at timestamptz not null default now()
);
alter table client_links enable row level security;
grant select, insert, update, delete on client_links to authenticated;

-- only admins create / manage client links
drop policy if exists "client_links_admin" on client_links;
create policy "client_links_admin" on client_links
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Public, read-only curated status — callable by anonymous visitors with a token.
-- Returns only client-safe data; internal comments/notes/analytics are never exposed.
create or replace function public.public_project_status(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lnk record;
  proj record;
begin
  select * into lnk from public.client_links where token = p_token;
  if lnk is null then return null; end if;
  select id, name, type from public.projects where id = lnk.project_id into proj;
  if proj is null then return null; end if;

  return jsonb_build_object(
    'project', jsonb_build_object('name', proj.name, 'type', proj.type),
    'showOpenBugs', lnk.show_open_bugs,
    'releases', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'version', r.version,
        'platform', r.platform,
        'environment', r.environment,
        'component', r.component,
        'status', r.status,
        'date', r.date,
        'notes', r.release_notes
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
