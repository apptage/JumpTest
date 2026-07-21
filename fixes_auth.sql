-- ============================================================
-- Auth fixes — run once in the Supabase SQL editor.
-- Addresses: missing profiles (account created but no profile),
-- self-healing profiles, and deleting users from Auth too.
-- ============================================================

-- 1. Backfill a profile for any auth user that doesn't have one
--    (e.g. accounts created before the trigger existed, like Hammad).
insert into public.profiles (id, email, name, role)
select
  u.id,
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
  'Developer'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- 2. Let a signed-in user create their OWN profile row (self-heal path
--    used by the app if the signup trigger ever misses). A guard forces
--    a safe role so nobody can self-insert as Admin / Team Lead.
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

create or replace function public.enforce_role_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin()
     and new.role not in ('Developer', 'QA') then
    new.role := 'Developer';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_insert_guard on public.profiles;
create trigger profiles_role_insert_guard before insert on public.profiles
  for each row execute function public.enforce_role_insert();

-- 3. Delete a user from BOTH Auth and the database.
--    Deleting auth.users cascades to profiles (FK on delete cascade).
create or replace function public.admin_delete_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete users';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  delete from auth.users where id = target;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
