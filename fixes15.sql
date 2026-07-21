-- fixes15.sql — One Bug = One Record + Bug History + atomic carry-forward.
--
-- BACK UP FIRST and run on a STAGING copy before production. This migration is
-- DESTRUCTIVE: it collapses the per-release duplicate bug rows (created by the
-- old copy-on-carry-forward) down to a single row per logical bug (bug_key),
-- rebuilding each defect's timeline into a new bug_history table and re-pointing
-- comments/notifications onto the surviving row before deleting the duplicates.
--
-- After this, `bugs.release_id` means "current release" (a bug is MOVED, never
-- copied), so a defect can only ever be on one release at a time.
--
-- Idempotent: safe to re-run (the collapse loop no-ops once each bug_key is
-- unique; the unique index / RPC use create-or-replace / if-not-exists).

-- ============================================================
-- 1) bug_history — full lifecycle audit trail
-- ============================================================
create table if not exists bug_history (
  id uuid primary key default gen_random_uuid(),
  bug_id uuid not null references bugs(id) on delete cascade,
  release_id uuid references releases(id) on delete set null,
  action text not null,           -- created | assigned | qa_failed | sent_back |
                                  -- carried_forward | reopened | fixed |
                                  -- proposed_close | approved | rejected | closed
  previous_status text,
  new_status text,
  moved_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists bug_history_bug_idx on bug_history (bug_id, created_at);

alter table bug_history enable row level security;
grant select, insert, update, delete on bug_history to authenticated;
drop policy if exists "bug_history_all" on bug_history;
create policy "bug_history_all" on bug_history for all to authenticated using (true) with check (true);

-- ============================================================
-- 2) Version normalization + collision resolution (needed before the
--    releases unique index in step 5 can be created)
-- ============================================================
-- strip a leading "v"/"V" and surrounding whitespace so 1.0.1 == v1.0.1
update releases set version = regexp_replace(btrim(coalesce(version, '')), '^[vV]+[[:space:]]*', '');

-- de-collide: within a (project, platform, component) stream, keep the newest
-- release's version string and suffix older equals " (1)", " (2)", …
with ranked as (
  select id,
         row_number() over (
           partition by project_id, lower(version), platform, coalesce(component, '')
           order by created_at desc, id
         ) as rn
  from releases
)
update releases r
set version = r.version || ' (' || (ranked.rn - 1) || ')'
from ranked
where ranked.id = r.id and ranked.rn > 1;

-- ============================================================
-- 3) Collapse duplicate bug rows → one row per bug_key, rebuilding history
-- ============================================================
do $$
declare
  grp record;
  survivor_id uuid;
  earliest_id uuid;
  origin_rel uuid;
begin
  for grp in
    select bug_key from bugs where bug_key is not null group by bug_key having count(*) > 1
  loop
    -- survivor = latest iteration (current live row); earliest = origin instance
    select id into survivor_id from bugs
      where bug_key = grp.bug_key
      order by coalesce(iteration, 1) desc, created_at desc, id desc limit 1;
    select id, release_id into earliest_id, origin_rel from bugs
      where bug_key = grp.bug_key
      order by coalesce(iteration, 1) asc, created_at asc, id asc limit 1;

    -- rebuild timeline: a 'created' event for the origin instance …
    insert into bug_history (bug_id, release_id, action, new_status, moved_by, created_at)
    select survivor_id, b.release_id, 'created', b.status, b.created_by_id, b.created_at
      from bugs b where b.id = earliest_id;
    -- … then a 'carried_forward' event for every later instance
    insert into bug_history (bug_id, release_id, action, new_status, moved_by, created_at)
    select survivor_id, b.release_id, 'carried_forward', b.status, b.created_by_id, b.created_at
      from bugs b
      where b.bug_key = grp.bug_key and b.id <> earliest_id
      order by coalesce(b.iteration, 1) asc, b.created_at asc;

    -- re-point child FKs (both ON DELETE CASCADE) onto the survivor FIRST
    update bug_comments set bug_id = survivor_id
      where bug_id in (select id from bugs where bug_key = grp.bug_key and id <> survivor_id);
    update notifications set bug_id = survivor_id
      where bug_id in (select id from bugs where bug_key = grp.bug_key and id <> survivor_id);

    -- pin the survivor's origin, then drop the duplicates
    update bugs set origin_release_id = origin_rel where id = survivor_id;
    delete from bugs where bug_key = grp.bug_key and id <> survivor_id;
  end loop;
end $$;

-- backfill a 'created' event for any bug that still has no history (single-
-- instance bugs, so the timeline UI always has at least one entry)
insert into bug_history (bug_id, release_id, action, new_status, moved_by, created_at)
select b.id, coalesce(b.origin_release_id, b.release_id), 'created', b.status, b.created_by_id, b.created_at
from bugs b
where not exists (select 1 from bug_history h where h.bug_id = b.id);

-- ============================================================
-- 4) Verify (raises a notice; check the output)
-- ============================================================
do $$
declare dup_bugs int; dup_vers int;
begin
  select count(*) into dup_bugs from (
    select bug_key from bugs where bug_key is not null group by bug_key having count(*) > 1
  ) x;
  select count(*) into dup_vers from (
    select 1 from releases group by project_id, lower(version), platform, coalesce(component, '')
    having count(*) > 1
  ) y;
  raise notice 'fixes15 verify: % bug_keys still duplicated, % version collisions remaining', dup_bugs, dup_vers;
end $$;

-- ============================================================
-- 5) Release version uniqueness (hard constraint)
-- ============================================================
create unique index if not exists releases_version_uidx
  on releases (project_id, lower(version), platform, coalesce(component, ''));

-- ============================================================
-- 6) Atomic, idempotent carry-forward RPC
--    Closes the prior releases and MOVES their unresolved bugs onto the new
--    release in one transaction, logging a carried_forward history event each.
--    Moving is an UPDATE, so a bug can never be duplicated onto a release, and
--    re-running is a no-op (priors are closed / already emptied).
-- ============================================================
create or replace function public.move_bugs_to_release(
  p_to_release uuid,
  p_prior_ids uuid[],
  p_moved_by uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_moved int := 0;
  v_pending int := 0;
  v_unresolved int := 0;
begin
  if p_to_release is null or p_prior_ids is null or array_length(p_prior_ids, 1) is null then
    return jsonb_build_object('moved', 0, 'pendingVerify', 0, 'unresolved', 0);
  end if;

  update releases set status = 'closed', closed_at = now()
    where id = any(p_prior_ids) and status <> 'closed';

  with moved as (
    update bugs b
      set release_id = p_to_release,
          carried_forward = true,
          iteration = coalesce(b.iteration, 1) + 1,
          carried_from_release_id = b.release_id,
          status = case when b.status = 'fixed' then 'fixed' else 'open' end,
          resolution = null,
          resolution_by_id = null,
          resolution_note = null,
          resolution_at = null
      where b.release_id = any(p_prior_ids)
        and b.status <> 'verified'
        and b.release_id <> p_to_release
      returning b.id, b.status
  ),
  hist as (
    insert into bug_history (bug_id, release_id, action, new_status, moved_by, notes)
    select m.id, p_to_release, 'carried_forward', m.status, p_moved_by, 'Moved from a superseded build'
    from moved m
    returning 1
  )
  select count(*),
         count(*) filter (where status = 'fixed'),
         count(*) filter (where status = 'open')
    into v_moved, v_pending, v_unresolved
    from moved;

  return jsonb_build_object('moved', v_moved, 'pendingVerify', v_pending, 'unresolved', v_unresolved);
end;
$$;
revoke all on function public.move_bugs_to_release(uuid, uuid[], uuid) from public, anon;
grant execute on function public.move_bugs_to_release(uuid, uuid[], uuid) to authenticated;
