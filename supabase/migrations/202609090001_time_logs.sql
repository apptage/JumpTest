-- 202609090001_time_logs.sql — mirror of fixes23.sql for `supabase db push`.
-- CANONICAL source is fixes23.sql at the repo root; regenerate this file from it
-- (do not hand-edit here) so the two never drift.

-- fixes23.sql — Time logs v2: live timer (Chrome extension) + manual entries.
--
-- ⚠️ Review and run on a STAGING copy first. Idempotent (safe to re-run).
-- CANONICAL copy. supabase/migrations/202609090001_time_logs.sql mirrors it.
--
-- REQUIRES fixes20.sql helpers: can_write(), manages_project(uuid),
-- is_project_member(uuid), my_team().
--
-- Model: one `time_logs` row per session (timer) or manual entry. A timer row
-- moves running → paused → running … → completed; every continuous Play stretch
-- is a `time_log_segments` row. The DATABASE owns the hours math (RPCs), never
-- the client. One open (running/paused) timer per user.
--
--   worked_ms  = sum of closed segment durations (maintained on pause/stop)
--   resumed_at = start of the CURRENT open segment (null when paused/completed)
--   running elapsed  = worked_ms + (now - resumed_at)     -- any client, no segments
--   paused  elapsed  = worked_ms                           -- frozen
--   paused_ms        = (now - started_at) - worked_ms
--   hours (on Stop)  = round(worked_ms / 3600000, 2); < 0.01h ⇒ session discarded
--
-- Works whether or not fixes21.sql was applied: creates the table if missing,
-- otherwise adds the timer columns and RELAXES fixes21's `hours NOT NULL
-- CHECK (0<h<=24)` (running rows have NULL hours; timers may exceed 24h).

-- ============================================================
-- 1) time_logs — base table (fresh installs get the final shape)
-- ============================================================
create table if not exists public.time_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  wbs_item_id uuid references public.wbs_items(id) on delete set null,
  hours       numeric(6,2),
  log_date    date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);

-- 2) timer columns — add nullable / with defaults first, backfill, then lock
alter table public.time_logs add column if not exists source     text;
alter table public.time_logs add column if not exists status     text;
alter table public.time_logs add column if not exists started_at timestamptz;
alter table public.time_logs add column if not exists ended_at   timestamptz;
alter table public.time_logs add column if not exists resumed_at timestamptz;
alter table public.time_logs add column if not exists paused_ms  integer;
alter table public.time_logs add column if not exists worked_ms  bigint;
alter table public.time_logs add column if not exists updated_at timestamptz;

-- backfill pre-existing (Hub-only) rows as completed manual entries
update public.time_logs set source    = 'manual'      where source    is null;
update public.time_logs set status    = 'completed'   where status    is null;
update public.time_logs set paused_ms = 0             where paused_ms is null;
update public.time_logs set worked_ms = 0             where worked_ms is null;
update public.time_logs set updated_at = created_at   where updated_at is null;

alter table public.time_logs alter column source     set not null;
alter table public.time_logs alter column status     set not null;
alter table public.time_logs alter column paused_ms  set not null;
alter table public.time_logs alter column paused_ms  set default 0;
alter table public.time_logs alter column worked_ms  set not null;
alter table public.time_logs alter column worked_ms  set default 0;
alter table public.time_logs alter column updated_at set not null;
alter table public.time_logs alter column updated_at set default now();

-- 3) relax fixes21's hours constraint (NULL while running; >24h allowed for timers)
alter table public.time_logs alter column hours drop not null;
alter table public.time_logs alter column hours type numeric(6,2);
alter table public.time_logs drop constraint if exists time_logs_hours_check;

-- 4) source-aware integrity checks (NOT VALID so dirty history never blocks the
--    run; `alter table public.time_logs validate constraint <name>;` once clean)
alter table public.time_logs drop constraint if exists time_logs_source_chk;
alter table public.time_logs add  constraint time_logs_source_chk
  check (source in ('timer','manual')) not valid;
alter table public.time_logs drop constraint if exists time_logs_status_chk;
alter table public.time_logs add  constraint time_logs_status_chk
  check (status in ('running','paused','completed')) not valid;
alter table public.time_logs drop constraint if exists time_logs_state_chk;
alter table public.time_logs add  constraint time_logs_state_chk check (
     (source = 'timer'  and status in ('running','paused')
        and started_at is not null and ended_at is null and hours is null)
  or (source = 'timer'  and status = 'completed'
        and started_at is not null and ended_at is not null and ended_at >= started_at
        and hours is not null and hours >= 0.01)
  or (source = 'manual' and status = 'completed'
        and started_at is null and ended_at is null and paused_ms = 0
        and hours is not null and hours > 0 and hours <= 24)
) not valid;

-- 5) indexes — incl. the ONE-open-timer-per-user guarantee
create index if not exists time_logs_project_date_idx on public.time_logs (project_id, log_date desc);
create index if not exists time_logs_user_date_idx    on public.time_logs (user_id, log_date desc);
drop index if exists time_logs_project_idx;   -- fixes21 names, superseded
drop index if exists time_logs_user_idx;
create unique index if not exists time_logs_one_open_per_user
  on public.time_logs (user_id) where status in ('running','paused');

-- ============================================================
-- 6) time_log_segments — one row per continuous Play stretch
-- ============================================================
create table if not exists public.time_log_segments (
  id          uuid primary key default gen_random_uuid(),
  time_log_id uuid not null references public.time_logs(id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists time_log_segments_log_idx on public.time_log_segments (time_log_id, started_at);
create unique index if not exists time_log_segments_one_open
  on public.time_log_segments (time_log_id) where ended_at is null;

-- ============================================================
-- 7) triggers — updated_at, and "WBS item must belong to the log's project"
--    (a TRIGGER, not an RPC check: manual "+" is a plain client INSERT)
-- ============================================================
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists time_logs_touch on public.time_logs;
create trigger time_logs_touch before update on public.time_logs
  for each row execute function public.set_updated_at();

create or replace function public.time_logs_check_wbs() returns trigger
language plpgsql as $$
begin
  if new.wbs_item_id is not null and not exists (
    select 1 from public.wbs_items w
    where w.id = new.wbs_item_id and w.project_id = new.project_id and w.type <> 'milestone'
  ) then
    raise exception 'WBS task must be a non-milestone item on the same project';
  end if;
  return new;
end; $$;
drop trigger if exists time_logs_wbs_guard on public.time_logs;
create trigger time_logs_wbs_guard before insert or update of wbs_item_id, project_id on public.time_logs
  for each row execute function public.time_logs_check_wbs();

-- ============================================================
-- 8) RLS
-- ============================================================
alter table public.time_logs enable row level security;
alter table public.time_log_segments enable row level security;
grant select, insert, update, delete on public.time_logs to authenticated;
grant select on public.time_log_segments to authenticated;   -- writes are RPC-only

-- readable to: the author, the project's manager, same-team members, project members
create or replace function public.can_see_time_log(p_user uuid, p_project uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
      or public.manages_project(p_project)
      or public.is_project_member(p_project)
      or (select team_id from public.projects where id = p_project) = public.my_team();
$$;

drop policy if exists "time_logs_select" on public.time_logs;
create policy "time_logs_select" on public.time_logs for select to authenticated
  using (public.can_see_time_log(user_id, project_id));

-- client INSERT = manual entries only; timer rows are created by time_log_start
drop policy if exists "time_logs_insert" on public.time_logs;
create policy "time_logs_insert" on public.time_logs for insert to authenticated
  with check (
    user_id = auth.uid() and public.can_write()
    and source = 'manual' and status = 'completed'
    and (public.manages_project(project_id) or public.is_project_member(project_id)
         or (select team_id from public.projects where id = project_id) = public.my_team())
  );

-- only the author edits their rows (managers may not edit someone else's timer)
drop policy if exists "time_logs_update" on public.time_logs;
create policy "time_logs_update" on public.time_logs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- author or project manager removes (matches the Hub "Remove")
drop policy if exists "time_logs_delete" on public.time_logs;
create policy "time_logs_delete" on public.time_logs for delete to authenticated
  using (user_id = auth.uid() or public.manages_project(project_id));

-- segments follow the parent log's visibility; no client writes at all
drop policy if exists "time_log_segments_select" on public.time_log_segments;
create policy "time_log_segments_select" on public.time_log_segments for select to authenticated
  using (exists (select 1 from public.time_logs l
                 where l.id = time_log_id and public.can_see_time_log(l.user_id, l.project_id)));

-- ============================================================
-- 9) RPCs — SECURITY DEFINER, own-row checks, DB owns the hours math
-- ============================================================
-- ms worked across a log's segments (open segment counted up to now)
create or replace function public.time_log_worked_ms(p_id uuid) returns bigint
  language sql stable security definer set search_path = public as $$
  select coalesce(sum(round(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)) * 1000)), 0)::bigint
  from public.time_log_segments s where s.time_log_id = p_id;
$$;

create or replace function public.time_log_start(p_project uuid, p_wbs uuid, p_log_date date, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.time_logs;
begin
  if not public.can_write() then raise exception 'Your role can''t log time'; end if;
  if exists (select 1 from public.time_logs where user_id = auth.uid() and status in ('running','paused')) then
    raise exception 'You already have a running or paused timer';
  end if;
  if not (public.manages_project(p_project) or public.is_project_member(p_project)
          or (select team_id from public.projects where id = p_project) = public.my_team()) then
    raise exception 'Not a member of this project';
  end if;
  insert into public.time_logs (user_id, project_id, wbs_item_id, source, status, started_at, resumed_at, log_date, note)
  values (auth.uid(), p_project, p_wbs, 'timer', 'running', now(), now(), coalesce(p_log_date, current_date), nullif(p_note, ''))
  returning * into v;                                   -- wbs guard trigger validates p_wbs
  insert into public.time_log_segments (time_log_id, started_at) values (v.id, v.started_at);
  return to_jsonb(v);
end; $$;

create or replace function public.time_log_pause(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.time_logs; w bigint;
begin
  select * into v from public.time_logs where id = p_id and user_id = auth.uid() and status = 'running' for update;
  if v is null then raise exception 'No running timer to pause'; end if;
  update public.time_log_segments set ended_at = now() where time_log_id = p_id and ended_at is null;
  w := public.time_log_worked_ms(p_id);
  update public.time_logs
     set status = 'paused', resumed_at = null, worked_ms = w,
         paused_ms = greatest(0, round(extract(epoch from (now() - started_at)) * 1000) - w)
   where id = p_id returning * into v;
  return to_jsonb(v);
end; $$;

create or replace function public.time_log_resume(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.time_logs;
begin
  select * into v from public.time_logs where id = p_id and user_id = auth.uid() and status = 'paused' for update;
  if v is null then raise exception 'No paused timer to resume'; end if;
  insert into public.time_log_segments (time_log_id, started_at) values (p_id, now());
  update public.time_logs set status = 'running', resumed_at = now() where id = p_id returning * into v;
  return to_jsonb(v);
end; $$;

create or replace function public.time_log_stop(p_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.time_logs; w bigint; h numeric(6,2);
begin
  select * into v from public.time_logs where id = p_id and user_id = auth.uid() and status in ('running','paused') for update;
  if v is null then raise exception 'No open timer to stop'; end if;
  update public.time_log_segments set ended_at = now() where time_log_id = p_id and ended_at is null;
  w := public.time_log_worked_ms(p_id);
  h := round(w / 3600000.0, 2);
  if h < 0.01 then
    delete from public.time_logs where id = p_id;           -- segments cascade
    return jsonb_build_object('discarded', true, 'log', null);
  end if;
  update public.time_logs
     set status = 'completed', ended_at = now(), resumed_at = null, worked_ms = w, hours = h,
         paused_ms = greatest(0, round(extract(epoch from (now() - started_at)) * 1000) - w),
         note = coalesce(nullif(p_note, ''), note)
   where id = p_id returning * into v;
  return jsonb_build_object('discarded', false, 'log', to_jsonb(v));
end; $$;

create or replace function public.time_log_discard(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.time_logs where id = p_id and user_id = auth.uid() and status in ('running','paused');
  if not found then raise exception 'No open timer to discard'; end if;
  return true;
end; $$;

revoke all on function public.time_log_start(uuid, uuid, date, text) from public, anon;
revoke all on function public.time_log_pause(uuid)   from public, anon;
revoke all on function public.time_log_resume(uuid)  from public, anon;
revoke all on function public.time_log_stop(uuid, text) from public, anon;
revoke all on function public.time_log_discard(uuid) from public, anon;
revoke all on function public.time_log_worked_ms(uuid) from public, anon;
grant execute on function public.time_log_start(uuid, uuid, date, text) to authenticated;
grant execute on function public.time_log_pause(uuid)   to authenticated;
grant execute on function public.time_log_resume(uuid)  to authenticated;
grant execute on function public.time_log_stop(uuid, text) to authenticated;
grant execute on function public.time_log_discard(uuid) to authenticated;
grant execute on function public.time_log_worked_ms(uuid) to authenticated;
