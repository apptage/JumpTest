-- ============================================================
-- Brands — the company shown to clients on a project's portal.
-- Admins create brands; each project picks one (projects.brand_id),
-- and projects without a pick use the single default brand, which
-- also appears on the sidebar and the sign-in page.
-- ============================================================

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  logo_url text not null,     -- for light backgrounds
  logo_dark_url text,         -- for dark backgrounds (optional)
  mark_url text,              -- square icon (optional)
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists brands_name_key on public.brands (lower(trim(name)));
create unique index if not exists brands_one_default on public.brands (is_default) where is_default;

alter table public.projects
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

-- existing logo ships with the app (public/brand/apptage)
insert into public.brands (name, logo_url, logo_dark_url, mark_url, is_default)
select 'Apptage', '/brand/apptage/logo-light.svg', '/brand/apptage/logo-dark.svg', '/brand/apptage/mark.svg',
       not exists (select 1 from public.brands where is_default)
where not exists (select 1 from public.brands where lower(trim(name)) = 'apptage');

-- ---------- RLS: everyone signed in reads; only admins change ----------
alter table public.brands enable row level security;

drop policy if exists "brands_select" on public.brands;
create policy "brands_select" on public.brands for select to authenticated using (true);

drop policy if exists "brands_insert" on public.brands;
create policy "brands_insert" on public.brands for insert to authenticated with check (public.is_admin());

drop policy if exists "brands_update" on public.brands;
create policy "brands_update" on public.brands for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- the default can't be deleted: pick another default first
drop policy if exists "brands_delete" on public.brands;
create policy "brands_delete" on public.brands for delete to authenticated
  using (public.is_admin() and not is_default);

grant select, insert, update, delete on public.brands to authenticated;
grant all on public.brands to service_role;

-- ---------- logo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "brand_assets_insert" on storage.objects;
create policy "brand_assets_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and public.is_admin());

-- ---------- RPCs ----------
-- two statements: the partial unique index is checked per row
create or replace function public.set_default_brand(p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the default brand';
  end if;
  if not exists (select 1 from public.brands where id = p_id) then
    raise exception 'Brand not found';
  end if;
  update public.brands set is_default = false where is_default and id <> p_id;
  update public.brands set is_default = true where id = p_id;
end;
$$;

create or replace function public.brand_public_json(b public.brands) returns jsonb
  language sql stable set search_path = public as $$
  select jsonb_build_object(
    'name', b.name, 'logoUrl', b.logo_url, 'logoDarkUrl', b.logo_dark_url, 'markUrl', b.mark_url
  );
$$;

-- no login: name + logos only. Null when no default brand exists.
create or replace function public.public_default_brand() returns jsonb
  language sql stable security definer set search_path = public as $$
  select public.brand_public_json(b) from public.brands b where b.is_default limit 1;
$$;

-- no login: the portal's brand for a client token. Null for an invalid token.
create or replace function public.public_project_brand(p_token text) returns jsonb
  language sql stable security definer set search_path = public as $$
  select public.brand_public_json(b)
  from public.client_links l
  join public.projects p on p.id = l.project_id
  join public.brands b on b.id = p.brand_id or (p.brand_id is null and b.is_default)
  where l.token = p_token
  limit 1;
$$;

revoke all on function public.set_default_brand(uuid) from public, anon;
grant execute on function public.set_default_brand(uuid) to authenticated, service_role;
revoke all on function public.brand_public_json(public.brands) from public, anon, authenticated;
grant execute on function public.public_default_brand() to anon, authenticated, service_role;
grant execute on function public.public_project_brand(text) to anon, authenticated, service_role;
