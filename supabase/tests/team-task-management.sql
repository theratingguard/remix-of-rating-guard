begin;

do $$
declare
  table_name text;
  function_source text;
  secured_tables text[] := array['teams', 'tasks', 'team_task_earnings'];
begin
  foreach table_name in array secured_tables loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing team workflow table: %', table_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || table_name)) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
    if has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') then
      raise exception 'Direct financial/team writes are available on public.%', table_name;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'manager_id'
      and data_type = 'uuid'
  ) then raise exception 'staff.manager_id must be a UUID'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'team_leader_id'
      and data_type = 'uuid'
  ) then raise exception 'staff.team_leader_id must be a UUID'; end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'teams_manager_active_idx'
  ) then raise exception 'Manager team lookup index is missing'; end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'tasks_assignee_status_created_idx'
  ) then raise exception 'Task assignee/status index is missing'; end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'team_task_earnings_staff_created_idx'
  ) then raise exception 'Earnings lookup index is missing'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%pending%'
      and pg_get_constraintdef(oid) like '%in_progress%'
      and pg_get_constraintdef(oid) like '%completed%'
      and pg_get_constraintdef(oid) like '%rejected%'
  ) then raise exception 'Task status constraint is incomplete'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.team_task_earnings'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) like '%task_id%'
      and pg_get_constraintdef(oid) like '%staff_id%'
      and pg_get_constraintdef(oid) like '%earning_type%'
  ) then raise exception 'Earnings are not idempotent per task and recipient'; end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks'
      and policyname = 'tasks_read_own_scope' and cmd = 'SELECT'
  ) then raise exception 'Task team-scope read policy is missing'; end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'staff'
      and policyname = 'staff_profile_read' and cmd = 'SELECT'
  ) then raise exception 'Staff team-scope read policy is missing'; end if;

  function_source := pg_get_functiondef('public.admin_create_team(uuid,uuid)'::regprocedure);
  if function_source not like '%team_is_superadmin%' then
    raise exception 'Only Superadmin must create or link teams';
  end if;
  function_source := pg_get_functiondef('public.admin_assign_staff_to_team(uuid,uuid)'::regprocedure);
  if function_source not like '%team_is_superadmin%' then
    raise exception 'Only Superadmin may reassign existing team members';
  end if;
  function_source := pg_get_functiondef('public.team_leader_add_staff(uuid)'::regprocedure);
  if function_source not like '%status = ''pending''%'
     or function_source not like '%team_leader_id is null%'
     or function_source not like '%status = ''approved''%' then
    raise exception 'Team leader can only attach and approve unassigned pending staff';
  end if;
  function_source := pg_get_functiondef('public.team_leader_pending_staff()'::regprocedure);
  if function_source not like '%team_lead in (leader.id::text, leader.name)%' then
    raise exception 'Team leaders must only see applications routed to them';
  end if;
  function_source := pg_get_functiondef('public.create_team_tasks(text,text,uuid[],timestamptz)'::regprocedure);
  if function_source not like '%outside your team scope%'
     or function_source not like '%cardinality(_assignees) > 100%' then
    raise exception 'Task creation is not team-scoped or bulk-limited';
  end if;
  function_source := pg_get_functiondef('public.update_team_task(uuid,text,text)'::regprocedure);
  if function_source not like '%Invalid task status transition%'
     or function_source not like '%not authorized%' then
    raise exception 'Task status transitions are not authorization checked';
  end if;
  function_source := pg_get_functiondef('public.credit_team_task_completion()'::regprocedure);
  if function_source not like '%staff_task%' or function_source not like '%90%'
     or function_source not like '%team_leader_task%' or function_source not like '%40%'
     or function_source not like '%manager_task%' or function_source not like '%20%'
     or function_source not like '%on conflict%' then
    raise exception 'Task completion payouts are incorrect or not idempotent';
  end if;
  if not has_function_privilege(
    'authenticated', 'public.team_leader_pending_staff()', 'EXECUTE'
  ) or not has_function_privilege(
    'authenticated', 'public.team_leader_add_staff(uuid)', 'EXECUTE'
  ) or not has_function_privilege(
    'authenticated', 'public.create_team_tasks(text,text,uuid[],timestamptz)', 'EXECUTE'
  ) or not has_function_privilege(
    'authenticated', 'public.update_team_task(uuid,text,text)', 'EXECUTE'
  ) then
    raise exception 'Expected authenticated workflow RPC grants are missing';
  end if;
end
$$;

rollback;
