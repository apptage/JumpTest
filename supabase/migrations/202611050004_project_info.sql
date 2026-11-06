-- ============================================================
-- Project Information: one place for a project's links, documents and credentials.
--
-- project_resources  links, server details and documents. Regular table + RLS.
-- project_credentials logins. Secrets live encrypted in Supabase Vault, never in
--   this table. The table has no client access at all: everything goes through the
--   RPCs below, which check permission and log every reveal.
-- ============================================================

-- ---------- who can do what ----------
-- read links/docs: anyone who can open the project
create or replace function public.can_view_project_info(p_project uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.manages_project(p_project)
      or public.is_project_member(p_project)
      or (select team_id from public.projects where id = p_project) = public.my_team();
$$;

-- add/edit links/docs: managers and the project's members
create or replace function public.can_edit_project_info(p_project uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.can_write() and (public.manages_project(p_project) or public.is_project_member(p_project));
$$;

-- a credential: managers always; project members only when it's shared with the team.
-- Being on the same team isn't enough.
create or replace function public.can_see_project_credential(p_project uuid, p_access text) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.manages_project(p_project)
      or (p_access = 'team' and public.is_project_member(p_project));
$$;

-- ---------- links + documents ----------
create table if not exists public.project_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in ('domain', 'staging', 'landing', 'server', 'docs', 'sow', 'design', 'brand', 'other')),
  title text not null check (length(trim(title)) > 0),
  url text check (url is null or url ~* '^https?://'),
  notes text not null default '',
  file_path text,
  file_name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_resources_project_idx on public.project_resources (project_id, category);

alter table public.project_resources enable row level security;

drop policy if exists "project_resources_select" on public.project_resources;
create policy "project_resources_select" on public.project_resources for select to authenticated
  using (public.can_view_project_info(project_id));
drop policy if exists "project_resources_insert" on public.project_resources;
create policy "project_resources_insert" on public.project_resources for insert to authenticated
  with check (public.can_edit_project_info(project_id));
drop policy if exists "project_resources_update" on public.project_resources;
create policy "project_resources_update" on public.project_resources for update to authenticated
  using (public.can_edit_project_info(project_id)) with check (public.can_edit_project_info(project_id));
drop policy if exists "project_resources_delete" on public.project_resources;
create policy "project_resources_delete" on public.project_resources for delete to authenticated
  using (public.can_edit_project_info(project_id));

revoke all on public.project_resources from anon;
grant select, insert, update, delete on public.project_resources to authenticated;
grant all on public.project_resources to service_role;

-- ---------- credentials ----------
create table if not exists public.project_credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (category in ('account', 'server', 'application', 'app_access', 'other')),
  label text not null check (length(trim(label)) > 0),
  url text check (url is null or url ~* '^https?://'),
  access_level text not null default 'managers' check (access_level in ('managers', 'team')),
  vault_secret_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_credentials_project_idx on public.project_credentials (project_id);

create table if not exists public.project_credential_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  credential_id uuid references public.project_credentials(id) on delete set null,
  label text not null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'secret_changed', 'revealed', 'deleted')),
  at timestamptz not null default now()
);
create index if not exists project_credential_log_project_idx on public.project_credential_log (project_id, at desc);

-- RLS on with no policies, and no grants: only the SECURITY DEFINER RPCs get in
alter table public.project_credentials enable row level security;
alter table public.project_credential_log enable row level security;
revoke all on public.project_credentials, public.project_credential_log from public, anon, authenticated;
grant all on public.project_credentials, public.project_credential_log to service_role;

-- deleting a credential (or its whole project) must not leave the secret behind
create or replace function public.project_credentials_drop_secret() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;
drop trigger if exists project_credentials_drop_secret on public.project_credentials;
create trigger project_credentials_drop_secret after delete on public.project_credentials
  for each row execute function public.project_credentials_drop_secret();

-- ---------- credential RPCs ----------
-- names and links only, and only the ones this user may see
create or replace function public.list_project_credentials(p_project uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'category', c.category, 'label', c.label, 'url', c.url,
    'accessLevel', c.access_level, 'updatedAt', c.updated_at
  ) order by c.category, c.label), '[]'::jsonb)
  from public.project_credentials c
  where c.project_id = p_project and public.can_see_project_credential(c.project_id, c.access_level);
$$;

-- decrypts one credential and logs who asked
create or replace function public.reveal_project_credential(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  c public.project_credentials;
  plain text;
begin
  select * into c from public.project_credentials where id = p_id;
  if c.id is null or not public.can_see_project_credential(c.project_id, c.access_level) then
    raise exception 'You don''t have access to this credential.';
  end if;
  select decrypted_secret into plain from vault.decrypted_secrets where id = c.vault_secret_id;
  insert into public.project_credential_log (project_id, credential_id, label, user_id, action)
    values (c.project_id, c.id, c.label, auth.uid(), 'revealed');
  return plain::jsonb;
end;
$$;

-- create (p_id null) or update. On update, a null username/password keeps what's stored.
create or replace function public.save_project_credential(
  p_id uuid, p_project uuid, p_category text, p_label text, p_url text, p_access_level text,
  p_username text, p_password text
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  c public.project_credentials;
  plain jsonb;
  new_id uuid;
begin
  if p_id is null then
    if not public.manages_project(p_project) then
      raise exception 'Only a Team Lead or Admin can manage credentials.';
    end if;
    if coalesce(p_username, '') = '' and coalesce(p_password, '') = '' then
      raise exception 'Enter a username or a password.';
    end if;
    insert into public.project_credentials (project_id, category, label, url, access_level, vault_secret_id, created_by, updated_by)
      values (p_project, p_category, trim(p_label), nullif(trim(coalesce(p_url, '')), ''), p_access_level,
              vault.create_secret(jsonb_build_object('username', coalesce(p_username, ''), 'password', coalesce(p_password, ''))::text),
              auth.uid(), auth.uid())
      returning id into new_id;
    insert into public.project_credential_log (project_id, credential_id, label, user_id, action)
      values (p_project, new_id, trim(p_label), auth.uid(), 'created');
    return new_id;
  end if;

  select * into c from public.project_credentials where id = p_id;
  if c.id is null or not public.manages_project(c.project_id) then
    raise exception 'Only a Team Lead or Admin can manage credentials.';
  end if;
  update public.project_credentials set
      category = p_category, label = trim(p_label), url = nullif(trim(coalesce(p_url, '')), ''),
      access_level = p_access_level, updated_by = auth.uid(), updated_at = now()
    where id = p_id;
  insert into public.project_credential_log (project_id, credential_id, label, user_id, action)
    values (c.project_id, p_id, trim(p_label), auth.uid(), 'updated');
  if p_username is not null or p_password is not null then
    select decrypted_secret::jsonb into plain from vault.decrypted_secrets where id = c.vault_secret_id;
    plain := jsonb_build_object(
      'username', coalesce(p_username, plain->>'username', ''),
      'password', coalesce(p_password, plain->>'password', ''));
    perform vault.update_secret(c.vault_secret_id, plain::text);
    insert into public.project_credential_log (project_id, credential_id, label, user_id, action)
      values (c.project_id, p_id, trim(p_label), auth.uid(), 'secret_changed');
  end if;
  return p_id;
end;
$$;

create or replace function public.delete_project_credential(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  c public.project_credentials;
begin
  select * into c from public.project_credentials where id = p_id;
  if c.id is null or not public.manages_project(c.project_id) then
    raise exception 'Only a Team Lead or Admin can manage credentials.';
  end if;
  insert into public.project_credential_log (project_id, credential_id, label, user_id, action)
    values (c.project_id, null, c.label, auth.uid(), 'deleted');
  delete from public.project_credentials where id = p_id;
end;
$$;

-- managers only: who revealed or changed what
create or replace function public.list_project_credential_log(p_project uuid) returns jsonb
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages_project(p_project) then
    raise exception 'Only a Team Lead or Admin can see the access log.';
  end if;
  return (
    select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb) from (
      select l.id, l.label, l.action, l.at, coalesce(pr.name, 'Removed user') as "userName"
      from public.project_credential_log l
      left join public.profiles pr on pr.id = l.user_id
      where l.project_id = p_project
      order by l.at desc
      limit 200
    ) x
  );
end;
$$;

revoke all on function public.list_project_credentials(uuid) from public, anon;
revoke all on function public.reveal_project_credential(uuid) from public, anon;
revoke all on function public.save_project_credential(uuid, uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.delete_project_credential(uuid) from public, anon;
revoke all on function public.list_project_credential_log(uuid) from public, anon;
revoke all on function public.project_credentials_drop_secret() from public, anon, authenticated;
revoke all on function public.can_see_project_credential(uuid, text) from public, anon;
grant execute on function public.list_project_credentials(uuid) to authenticated;
grant execute on function public.reveal_project_credential(uuid) to authenticated;
grant execute on function public.save_project_credential(uuid, uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.delete_project_credential(uuid) to authenticated;
grant execute on function public.list_project_credential_log(uuid) to authenticated;
grant execute on function public.can_see_project_credential(uuid, text) to authenticated;

-- ---------- document storage: private, reached through short-lived signed URLs ----------
-- files sit under <project id>/…, so the path decides who gets in
create or replace function public.project_file_project(p_name text) returns uuid
  language sql stable security definer set search_path = public as $$
  select p.id from public.projects p where p.id::text = split_part(p_name, '/', 1);
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, 26214400, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/zip', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict (id) do nothing;

drop policy if exists "project_files_select" on storage.objects;
create policy "project_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.can_view_project_info(public.project_file_project(name)));
drop policy if exists "project_files_insert" on storage.objects;
create policy "project_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.can_edit_project_info(public.project_file_project(name)));
drop policy if exists "project_files_delete" on storage.objects;
create policy "project_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.can_edit_project_info(public.project_file_project(name)));
