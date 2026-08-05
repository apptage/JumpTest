CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






-- Layer 1: no custom function dependencies
CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'Admin');
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_team"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select team_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."my_team"() OWNER TO "postgres";


-- Layer 2: depend only on tables / auth
CREATE OR REPLACE FUNCTION "public"."can_manage_roles"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Admin', 'Team Lead')
  );
$$;


ALTER FUNCTION "public"."can_manage_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_project_member"("p_project" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = auth.uid()
      and (m.expires_at is null or m.expires_at > now())
  );
$$;


ALTER FUNCTION "public"."is_project_member"("p_project" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_project"("p_release" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select project_id from public.releases where id = p_release;
$$;


ALTER FUNCTION "public"."release_project"("p_release" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_team"("p_release" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.team_id from public.releases r
    join public.projects p on p.id = r.project_id
   where r.id = p_release;
$$;


ALTER FUNCTION "public"."release_team"("p_release" "uuid") OWNER TO "postgres";


-- Layer 3: depend on my_role / my_team / is_admin
CREATE OR REPLACE FUNCTION "public"."can_write"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select auth.uid() is not null and coalesce(public.my_role(), '') <> 'Manager';
$$;


ALTER FUNCTION "public"."can_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manages_project"("p_project" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_admin() or exists (
    select 1 from public.projects p
    where p.id = p_project and public.my_role() = 'Team Lead' and p.team_id = public.my_team()
  );
$$;


ALTER FUNCTION "public"."manages_project"("p_project" "uuid") OWNER TO "postgres";


-- Layer 4: everything else
CREATE OR REPLACE FUNCTION "public"."admin_create_team"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create teams';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Team name is required';
  end if;
  insert into public.teams (name) values (trim(p_name)) returning id into new_id;
  return new_id;
end;
$$;


ALTER FUNCTION "public"."admin_create_team"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_team"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete teams';
  end if;
  delete from public.teams where id = p_id;
end;
$$;


ALTER FUNCTION "public"."admin_delete_team"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("target" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_delete_user"("target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_release_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if exists (
      select 1 from public.bugs b
      where b.release_id = new.id
        and b.status <> 'verified'
        and lower(b.severity) in ('critical', 'major')
    ) then
      raise exception 'Cannot approve: release still has open blocking (Major/Critical) bugs';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_release_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_release_qa_actor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status is distinct from old.status
     and new.status in ('qa_in_progress','qa_done','approved','sent_back') then
    if not (
      public.manages_project(new.project_id)
      or new.assigned_qa = auth.uid()
      or old.assigned_qa = auth.uid()
      or (old.assigned_qa is null and public.my_role() = 'QA')
    ) then
      raise exception 'Only the assigned QA or a project manager may set QA-outcome statuses';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_release_qa_actor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_role text;
  caller_team uuid;
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    select role, team_id into caller_role, caller_team
      from public.profiles where id = auth.uid();
    if caller_role = 'Admin' then
      return new; -- admins may grant any role
    end if;
    -- a Team Lead may only reassign their own team's line staff, and only
    -- between the two non-privileged roles (never to/from Admin/TL/Manager)
    if caller_role = 'Team Lead'
       and old.role in ('Developer','QA')
       and new.role in ('Developer','QA')
       and old.team_id is not distinct from caller_team then
      return new;
    end if;
    raise exception 'Only admins may grant Admin/Team Lead/Manager roles';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_role_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null and not public.is_admin()
     and new.role not in ('Developer', 'QA') then
    new.role := 'Developer';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_role_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  existing int;
  assigned_role text;
  meta_role text;
begin
  if lower(split_part(new.email, '@', 2)) <> 'jumppace.com' then
    raise exception 'Only @jumppace.com email addresses are allowed';
  end if;

  select count(*) into existing from public.profiles;
  meta_role := new.raw_user_meta_data->>'role';

  if existing = 0 then
    assigned_role := 'Admin';                 -- first user bootstrap
  elsif meta_role in ('Developer', 'QA') then
    assigned_role := meta_role;               -- self-selected at signup
  else
    assigned_role := 'Developer';             -- safe default
  end if;

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
          assigned_role);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_bugs_to_release"("p_to_release" "uuid", "p_prior_ids" "uuid"[], "p_moved_by" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_moved int := 0;
  v_pending int := 0;
  v_unresolved int := 0;
begin
  -- authz: caller must own / QA / manage the TARGET release (never trust p_moved_by)
  if not (
    public.is_admin()
    or exists (
      select 1 from public.releases r
      left join public.projects pr on pr.id = r.project_id
      where r.id = p_to_release
        and ( r.submitted_by_id = auth.uid()
           or r.assigned_qa = auth.uid()
           or (public.my_role() = 'Team Lead' and pr.team_id = public.my_team()) )
    )
  ) then
    raise exception 'Not authorized to move bugs onto this release';
  end if;

  if p_to_release is null or p_prior_ids is null or array_length(p_prior_ids, 1) is null then
    return jsonb_build_object('moved', 0, 'pendingVerify', 0, 'unresolved', 0);
  end if;

  -- integrity: every prior must belong to the SAME stream (project + platform +
  -- component) as the target. Without this, an authorized submitter of release B
  -- could pass arbitrary prior UUIDs and close + raid the bugs of unrelated
  -- releases in other projects. This mirrors the app's own "priors" selection.
  if exists (
    select 1 from public.releases r, public.releases t
    where t.id = p_to_release and r.id = any(p_prior_ids)
      and ( r.project_id is distinct from t.project_id
         or r.platform   is distinct from t.platform
         or coalesce(r.component,'') is distinct from coalesce(t.component,'') )
  ) then
    raise exception 'Prior releases must be in the same project/platform stream as the target';
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
    -- attribute to the authenticated caller, not the client-supplied p_moved_by
    -- (which could be spoofed); fall back to p_moved_by only for service-role calls
    -- where auth.uid() is null.
    select m.id, p_to_release, 'carried_forward', m.status, coalesce(auth.uid(), p_moved_by), 'Moved from a superseded build'
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


ALTER FUNCTION "public"."move_bugs_to_release"("p_to_release" "uuid", "p_prior_ids" "uuid"[], "p_moved_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."public_project_status"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  lnk record;
  proj record;
begin
  select * into lnk from public.client_links where token = p_token;
  if lnk is null then return null; end if;
  select id, name, type, wbs_enabled from public.projects where id = lnk.project_id into proj;
  if proj is null then return null; end if;

  return jsonb_build_object(
    'project', jsonb_build_object('name', proj.name, 'type', proj.type),
    'wbsEnabled', proj.wbs_enabled,
    'showOpenBugs', lnk.show_open_bugs,
    'lastUpdated', (select max(i.updated_at) from public.wbs_items i where i.project_id = proj.id),
    'platformTargets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'platform', t.platform_type,
        'completionDate', t.completion_date,
        'deploymentDate', t.deployment_date
      )), '[]'::jsonb)
      from public.wbs_platform_targets t where t.project_id = proj.id
    ),
    'wbs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'platform', i.platform_type, 'section', i.module, 'type', i.type,
        'name', i.title, 'status', i.status, 'est', i.estimated_completion_date,
        'position', i.position
      ) order by i.position), '[]'::jsonb)
      from public.wbs_items i where i.project_id = proj.id
    ),
    'wbsProgress', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where i.status = 'completed') / count(*)) end
      from public.wbs_items i where i.project_id = proj.id and i.type <> 'milestone'
    ),
    'releases', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'version', r.version, 'platform', r.platform, 'environment', r.environment,
        'component', r.component, 'status', r.status, 'date', r.date, 'notes', r.release_notes
      ) order by r.date desc, r.created_at desc), '[]'::jsonb)
      from public.releases r where r.project_id = proj.id and r.status <> 'closed'
    ),
    'bugs', (
      select jsonb_build_object(
        'open', count(*) filter (where b.status <> 'verified'),
        'resolved', count(*) filter (where b.status = 'verified')
      )
      from public.bugs b
      join public.releases r2 on r2.id = b.release_id
      where r2.project_id = proj.id and r2.status <> 'closed'
    )
  );
end;
$$;


ALTER FUNCTION "public"."public_project_status"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_wbs_enabled"("p_project" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (public.is_admin()
          or exists (select 1 from public.projects p
                     where p.id = p_project and p.team_id = public.my_team())
             and coalesce(public.my_role(),'') <> 'Manager') then
    raise exception 'Not authorized to enable WBS on this project';
  end if;
  update public.projects set wbs_enabled = true where id = p_project;
end;
$$;


ALTER FUNCTION "public"."set_wbs_enabled"("p_project" "uuid") OWNER TO "postgres";
