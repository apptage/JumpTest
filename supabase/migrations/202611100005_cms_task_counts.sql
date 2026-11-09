-- ============================================================
-- Project Hub's CMS cards show "N open tasks · N tasks done". They used to
-- download every task of every CMS project to count them; this counts in the
-- database, for just the projects on screen. Runs as the caller (row-level
-- security applies). Projects with no tasks are left out.
-- ============================================================

create or replace function public.cms_task_counts(p_project_ids uuid[])
  returns jsonb
  language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_object_agg(x.project_id, jsonb_build_object('open', x.open, 'done', x.done, 'total', x.total)), '{}'::jsonb)
  from (
    select t.project_id,
           count(*) filter (where t.status <> 'done') as open,
           count(*) filter (where t.status = 'done') as done,
           count(*) as total
    from public.cms_tasks t
    where t.project_id = any(p_project_ids)
    group by t.project_id
  ) x;
$$;

revoke all on function public.cms_task_counts(uuid[]) from public, anon;
grant execute on function public.cms_task_counts(uuid[]) to authenticated, service_role;
