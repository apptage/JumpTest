-- ============================================================
-- WBS work tracks + the SQA completion rule.
--
-- A project's real work is more than its original scope, so every WBS item now
-- belongs to a track. Everything already in the WBS stays in 'scope'.
-- ============================================================

alter table public.wbs_items
  add column if not exists track text not null default 'scope';

alter table public.wbs_items drop constraint if exists wbs_items_track_chk;
alter table public.wbs_items add constraint wbs_items_track_chk
  check (track in ('scope', 'improvements', 'upsell', 'design', 'marketing', 'support'));

create index if not exists wbs_items_project_track_idx on public.wbs_items (project_id, track);

alter table public.projects
  add column if not exists ongoing_support boolean not null default false;

-- ---------- SQA rule ----------
-- A story point only becomes Completed once SQA has reviewed it: the acting user
-- is QA, or the item is linked to a release QA has ruled on (the Approved / Sent
-- Back reconciliation, which a project manager can also trigger). Design and
-- marketing work isn't tested by SQA, so those tracks are exempt. Rows already
-- Completed are left alone. No auth.uid() = migrations / service role.
create or replace function public.wbs_items_guard_completion() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'completed' or new.track in ('design', 'marketing') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' and old.track = new.track then
    return new;
  end if;
  if auth.uid() is null or public.my_role() = 'QA' then
    return new;
  end if;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.release_tasks rt
    join public.releases r on r.id = rt.release_id
    where rt.task_id = new.id and r.status in ('approved', 'sent_back')
  ) then
    return new;
  end if;
  raise exception 'Only SQA can mark a story point as Completed.';
end;
$$;

drop trigger if exists wbs_items_guard_completion on public.wbs_items;
create trigger wbs_items_guard_completion
  before insert or update of status, track on public.wbs_items
  for each row execute function public.wbs_items_guard_completion();

-- ---------- client portal ----------
-- Kept apart from public_project_status: items with their track, the support flag
-- and the bug counts that feed the portal's completion %. Null for a bad token.
create or replace function public.public_project_work(p_token text) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ongoingSupport', p.ongoing_support,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'track', i.track, 'platform', i.platform_type, 'section', i.module, 'type', i.type,
        'name', i.title, 'status', i.status, 'est', i.estimated_completion_date
      ) order by i.position), '[]'::jsonb)
      from public.wbs_items i where i.project_id = p.id
    ),
    'bugs', (
      select jsonb_build_object(
        'open', count(*) filter (where b.status <> 'verified'),
        'resolved', count(*) filter (where b.status = 'verified')
      )
      from public.bugs b
      join public.releases r on r.id = b.release_id
      where r.project_id = p.id and r.status <> 'closed'
    )
  )
  from public.client_links l
  join public.projects p on p.id = l.project_id
  where l.token = p_token;
$$;

grant execute on function public.public_project_work(text) to anon, authenticated, service_role;
