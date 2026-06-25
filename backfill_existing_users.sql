-- ============================================================
-- One-time backfill.
-- Run this AFTER supabase_setup.sql if you already created auth
-- accounts before the profiles table/trigger existed (those users
-- have no profile row and get stuck on "No profile for this account").
--
-- This inserts the role inline (no UPDATE), so the role-change guard
-- trigger is never triggered. Safe to re-run: only inserts missing rows.
-- ============================================================

insert into public.profiles (id, email, name, role)
select
  u.id,
  u.email,
  coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1)),
  case
    -- the earliest account becomes Admin if there is no Admin yet
    when not exists (select 1 from public.profiles where role = 'Admin')
         and u.id = (select id from auth.users order by created_at asc limit 1)
    then 'Admin'
    else 'Developer'
  end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Check the result:
-- select email, name, role from public.profiles order by created_at;
