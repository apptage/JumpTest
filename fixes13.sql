-- fixes13.sql — Push notifications (Firebase Cloud Messaging) foundation.
--
-- 1) user_devices — one row per (user, device/browser) FCM token. A user may
--    have many devices; a token is globally unique. The send-push Edge Function
--    (service role) reads enabled rows to deliver pushes, and prunes tokens FCM
--    reports as stale by setting enabled = false.
-- 2) notifications — enriched so history is self-describing and deep-linkable:
--    title, bug_id, a free-form data jsonb (extra ids/route), and a link path.
--
-- Idempotent — safe to re-run. Follows the existing fixes*.sql conventions.

-- ------------------------------------------------------------
-- user_devices
-- ------------------------------------------------------------
create table if not exists user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  fcm_token text not null unique,
  platform text not null default 'web',        -- web | android | ios
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists user_devices_user_idx on user_devices (user_id);
create index if not exists user_devices_enabled_idx on user_devices (user_id, enabled);

alter table user_devices enable row level security;
grant select, insert, update, delete on user_devices to authenticated;

-- a user manages only their own device rows (tokens are sensitive)
drop policy if exists user_devices_select on user_devices;
create policy user_devices_select on user_devices
  for select using (auth.uid() = user_id);
drop policy if exists user_devices_insert on user_devices;
create policy user_devices_insert on user_devices
  for insert with check (auth.uid() = user_id);
drop policy if exists user_devices_update on user_devices;
create policy user_devices_update on user_devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists user_devices_delete on user_devices;
create policy user_devices_delete on user_devices
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- notifications — richer history + deep-linking
-- ------------------------------------------------------------
alter table notifications add column if not exists title text;
alter table notifications add column if not exists bug_id uuid references bugs(id) on delete cascade;
alter table notifications add column if not exists data jsonb not null default '{}'::jsonb;
alter table notifications add column if not exists link text;

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);
