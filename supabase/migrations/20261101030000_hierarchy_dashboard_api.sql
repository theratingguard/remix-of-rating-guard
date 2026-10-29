begin;

create index if not exists staff_reports_to_idx on public.staff (reports_to);

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* 'assigned_role'
  loop
    execute format('alter table public.tasks drop constraint %I', constraint_row.conname);
  end loop;
end
$$;

alter table public.tasks
  add constraint tasks_assigned_role_hierarchy_check
  check (assigned_role in (
    'Manager',
    'Team Leader',
    'Staff',
    'Global Manager',
    'Country Manager',
    'State Manager',
    'Divisional Manager',
    'District Manager',
    'Team Manager',
    'Team Member'
  ));

create or replace function public.hierarchy_expected_child_role(_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case public.normalize_hierarchy_role(_role)
    when 'global_manager' then 'country_manager'
    when 'country_manager' then 'state_manager'
    when 'state_manager' then 'divisional_manager'
    when 'divisional_manager' then 'district_manager'
    when 'district_manager' then 'team_manager'
    when 'team_manager' then 'team_leader'
    when 'team_leader' then 'team_member'
    else null
  end
$$;

create or replace function public.team_can_manage_member(_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.team_is_superadmin()
    or exists (
      select 1
      from public.staff actor
      join public.staff child
        on child.reports_to = actor.id
       and child.id = _staff_id
      where actor.id = auth.uid()
        and actor.status in ('active', 'approved')
        and child.status in ('active', 'approved')
        and public.normalize_hierarchy_role(child.role)
          = public.hierarchy_expected_child_role(actor.role)
    )
  )
$$;

create or replace function public.team_can_read_task(_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.team_is_superadmin()
    or exists (
      select 1 from public.tasks task
      where task.id = _task_id
        and (
          task.assigned_to = auth.uid()
          or task.created_by = auth.uid()
          or public.team_can_manage_member(task.assigned_to)
        )
    )
  )
$$;

drop function if exists public.team_member_directory();
create function public.team_member_directory()
returns table(
  id uuid,
  unique_id text,
  role text,
  status text,
  team_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  child_role text;
begin
  if actor_id is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;

  select s.role into actor_role
  from public.staff s
  where s.id = actor_id
    and s.status in ('active', 'approved');
  if not found then
    raise exception 'An active hierarchy account is required'
      using errcode = '42501';
  end if;

  child_role := public.hierarchy_expected_child_role(actor_role);
  if child_role is null then
    raise exception 'This role has no direct reports' using errcode = '42501';
  end if;

  return query
    select s.id, s.unique_id, s.role, s.status, s.team_id
    from public.staff s
    where s.reports_to = actor_id
      and s.status in ('active', 'approved')
      and public.normalize_hierarchy_role(s.role) = child_role
    order by s.unique_id;
end
$$;

create or replace function public.guard_hierarchy_task_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  child_role text;
  target_role text;
begin
  if actor_id is null or public.team_is_superadmin() then
    return new;
  end if;

  select s.role into actor_role
  from public.staff s
  where s.id = actor_id
    and s.status in ('active', 'approved');
  if not found then
    return new;
  end if;

  child_role := public.hierarchy_expected_child_role(actor_role);
  if tg_op = 'INSERT' then
    if child_role is null or new.created_by <> actor_id then
      raise exception 'Hierarchy task creation requires an active direct-report role'
        using errcode = '42501';
    end if;

    select public.normalize_hierarchy_role(s.role)
      into target_role
    from public.staff s
    where s.id = new.assigned_to
      and s.reports_to = actor_id
      and s.status in ('active', 'approved');
    if not found or target_role <> child_role then
      raise exception 'Tasks may only be assigned to an active direct report'
        using errcode = '42501';
    end if;

    new.assigned_role := case target_role
      when 'global_manager' then 'Global Manager'
      when 'country_manager' then 'Country Manager'
      when 'state_manager' then 'State Manager'
      when 'divisional_manager' then 'Divisional Manager'
      when 'district_manager' then 'District Manager'
      when 'team_manager' then 'Manager'
      when 'team_leader' then 'Team Leader'
      when 'team_member' then 'Staff'
    end;
    return new;
  end if;

  if new.assigned_to is distinct from old.assigned_to
     or (
       new.status is distinct from old.status
       and new.assigned_to <> actor_id
       and not public.team_can_manage_member(new.assigned_to)
     ) then
    raise exception 'Hierarchy users may only update their own tasks or direct-report tasks'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists tasks_hierarchy_write_guard on public.tasks;
create trigger tasks_hierarchy_write_guard
  before insert or update on public.tasks
  for each row execute function public.guard_hierarchy_task_write();

drop function if exists public.hierarchy_direct_reports();
create function public.hierarchy_direct_reports()
returns table(
  id uuid,
  name text,
  unique_id text,
  role text,
  status text,
  tasks_assigned integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  child_role text;
begin
  if actor_id is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;

  select public.normalize_hierarchy_role(s.role)
    into actor_role
  from public.staff s
  where s.id = actor_id
    and s.status in ('active', 'approved');

  if not found then
    raise exception 'An active hierarchy account is required'
      using errcode = '42501';
  end if;

  child_role := public.hierarchy_expected_child_role(actor_role);
  if child_role is null then
    return;
  end if;

  return query
    select s.id, s.name, s.unique_id, s.role, s.status,
      (select count(*)::integer from public.tasks t where t.assigned_to = s.id)
    from public.staff s
    where s.reports_to = actor_id
      and public.normalize_hierarchy_role(s.role) = child_role
    order by s.unique_id;
end
$$;

create or replace function public.hierarchy_task_summary()
returns table(
  total_tasks integer,
  pending_tasks integer,
  in_progress_tasks integer,
  completed_tasks integer,
  rejected_tasks integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  child_role text;
begin
  if actor_id is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;

  select public.normalize_hierarchy_role(s.role)
    into actor_role
  from public.staff s
  where s.id = actor_id
    and s.status in ('active', 'approved');

  if not found then
    raise exception 'An active hierarchy account is required'
      using errcode = '42501';
  end if;

  child_role := public.hierarchy_expected_child_role(actor_role);

  return query
    select
      count(t.id)::integer,
      count(t.id) filter (where t.status = 'pending')::integer,
      count(t.id) filter (where t.status = 'in_progress')::integer,
      count(t.id) filter (where t.status = 'completed')::integer,
      count(t.id) filter (where t.status = 'rejected')::integer
    from public.staff s
    left join public.tasks t on t.assigned_to = s.id
    where child_role is not null
      and s.reports_to = actor_id
      and s.status in ('active', 'approved')
      and public.normalize_hierarchy_role(s.role) = child_role;
end
$$;

create or replace function public.create_hierarchy_review_task(
  _assignee_id uuid,
  _review_url text,
  _title text,
  _description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  child_role text;
  target public.staff%rowtype;
  assigned_role_label text;
  reviewer_name text;
  reviewer_profile_url text;
  review_text text;
  task_team_id uuid;
  task_manager_id uuid;
  task_team_leader_id uuid;
  created_task_id uuid := gen_random_uuid();
begin
  if actor_id is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  if length(trim(coalesce(_title, ''))) not between 1 and 160
     or length(coalesce(_description, '')) > 5000 then
    raise exception 'Task title or description is invalid';
  end if;
  if length(trim(coalesce(_review_url, ''))) not between 1 and 2048 then
    raise exception 'A Google review URL is required';
  end if;
  if trim(_review_url) !~* '^https://([a-z0-9-]+\.)*google\.[a-z]{2,}(\.[a-z]{2})?([/:?#]|$)'
     and trim(_review_url) !~* '^https://(maps\.app\.goo\.gl|goo\.gl|g\.page)([/:?#]|$)' then
    raise exception 'Enter a valid Google Maps review URL';
  end if;

  select public.normalize_hierarchy_role(s.role)
    into actor_role
  from public.staff s
  where s.id = actor_id
    and s.status in ('active', 'approved');
  if not found then
    raise exception 'An active hierarchy account is required'
      using errcode = '42501';
  end if;
  child_role := public.hierarchy_expected_child_role(actor_role);
  if child_role is null then
    raise exception 'This role cannot assign tasks to direct reports'
      using errcode = '42501';
  end if;

  select s.*
    into target
  from public.staff s
  where s.id = _assignee_id
    and s.reports_to = actor_id
    and s.status in ('active', 'approved')
    and public.normalize_hierarchy_role(s.role) = child_role;
  if not found then
    raise exception 'You can only assign tasks to an active direct report'
      using errcode = '42501';
  end if;

  select coalesce(r.author, 'Anonymous'), r.author_uri, r.text
    into reviewer_name, reviewer_profile_url, review_text
  from public.reviews r
  where r.review_uri = trim(_review_url)
     or r.review_url = trim(_review_url)
  order by r.created_at desc nulls last
  limit 1;
  if not found then
    raise exception 'Review URL was not found in the local review database. Scan or import it first.';
  end if;

  assigned_role_label := case child_role
    when 'global_manager' then 'Global Manager'
    when 'country_manager' then 'Country Manager'
    when 'state_manager' then 'State Manager'
    when 'divisional_manager' then 'Divisional Manager'
    when 'district_manager' then 'District Manager'
    when 'team_manager' then 'Manager'
    when 'team_leader' then 'Team Leader'
    when 'team_member' then 'Staff'
  end;

  if child_role in ('team_manager', 'team_leader', 'team_member') then
    select t.id, t.manager_id, t.team_leader_id
      into task_team_id, task_manager_id, task_team_leader_id
    from public.teams t
    where t.is_active
      and (
        (child_role = 'team_manager' and t.manager_id = target.id)
        or (child_role = 'team_leader' and t.team_leader_id = target.id)
        or (
          child_role = 'team_member'
          and t.team_leader_id = target.team_leader_id
          and t.manager_id = target.manager_id
        )
      )
    order by t.created_at
    limit 1;
  end if;

  insert into public.tasks (
    id, team_id, manager_id, team_leader_id, assigned_to, assigned_role,
    created_by, title, description, review_url, review_text,
    reviewer_name, reviewer_profile_url
  ) values (
    created_task_id, task_team_id, task_manager_id, task_team_leader_id,
    target.id, assigned_role_label, actor_id, trim(_title),
    coalesce(_description, ''), trim(_review_url), review_text,
    reviewer_name, reviewer_profile_url
  );

  return created_task_id;
end
$$;

revoke all on function public.hierarchy_expected_child_role(text) from public, anon, authenticated;
revoke all on function public.guard_hierarchy_task_write() from public, anon, authenticated;
revoke all on function public.team_can_manage_member(uuid) from public, anon;
revoke all on function public.team_can_read_task(uuid) from public, anon;
revoke all on function public.team_member_directory() from public, anon;
revoke all on function public.hierarchy_direct_reports() from public, anon;
revoke all on function public.hierarchy_task_summary() from public, anon;
revoke all on function public.create_hierarchy_review_task(uuid, text, text, text) from public, anon;
grant execute on function public.hierarchy_direct_reports() to authenticated, service_role;
grant execute on function public.hierarchy_task_summary() to authenticated, service_role;
grant execute on function public.create_hierarchy_review_task(uuid, text, text, text)
  to authenticated, service_role;
grant execute on function public.team_can_manage_member(uuid) to authenticated, service_role;
grant execute on function public.team_can_read_task(uuid) to authenticated, service_role;
grant execute on function public.team_member_directory() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
