-- ============================================================
-- Record SQA's sign-off on each story point, so the WBS can show who approved it
-- and when. An approval through a release is already on record in release_tasks;
-- these columns cover direct sign-off in the WBS, including items that were
-- Completed before the SQA rule existed.
-- ============================================================

alter table public.wbs_items
  add column if not exists qa_approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists qa_approved_at timestamptz;

-- Replaces the guard from 202611050002. Only this trigger writes the sign-off, so
-- it can't be set by hand: a client asking for it (qa_approved_at) gets a stamp
-- only if the acting user is QA, and leaving Completed clears it.
create or replace function public.wbs_items_guard_completion() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  asked_sign_off boolean := new.qa_approved_at is not null
    and (tg_op = 'INSERT' or old.qa_approved_at is null);
  is_qa boolean := public.my_role() = 'QA';
begin
  if tg_op = 'UPDATE' then
    new.qa_approved_by := old.qa_approved_by;
    new.qa_approved_at := old.qa_approved_at;
  else
    new.qa_approved_by := null;
    new.qa_approved_at := null;
  end if;

  if new.status <> 'completed' then
    new.qa_approved_by := null;
    new.qa_approved_at := null;
    return new;
  end if;

  if new.track in ('design', 'marketing') then
    return new; -- not SQA-tested
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' and old.track = new.track then
    if is_qa and asked_sign_off then
      new.qa_approved_by := auth.uid();
      new.qa_approved_at := now();
    end if;
    return new;
  end if;

  if is_qa then
    new.qa_approved_by := auth.uid();
    new.qa_approved_at := now();
    return new;
  end if;

  if auth.uid() is null then
    return new; -- migrations / service role
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
  before insert or update of status, track, qa_approved_by, qa_approved_at on public.wbs_items
  for each row execute function public.wbs_items_guard_completion();
