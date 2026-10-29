begin;

-- Hierarchy roles live on public.staff.role; public.profiles has no role column
-- or role constraint. Keep staff.reports_to authoritative for access checks.
alter table public.profiles
  add column if not exists parent_id uuid
  references auth.users(id) on delete set null;

create or replace function public.normalize_hierarchy_role(_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case replace(replace(lower(trim(coalesce(_role, ''))), ' ', '_'), '-', '_')
    when 'manager' then 'team_manager'
    when 'team_lead' then 'team_leader'
    when 'tl' then 'team_leader'
    when 'staff' then 'team_member'
    else replace(replace(lower(trim(coalesce(_role, ''))), ' ', '_'), '-', '_')
  end
$$;

create or replace function public.enforce_staff_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  child_role text := public.normalize_hierarchy_role(new.role);
  expected_parent_role text;
  actual_parent_role text;
  actual_parent_status text;
begin
  if child_role not in (
    'global_manager',
    'country_manager',
    'state_manager',
    'divisional_manager',
    'district_manager',
    'team_manager',
    'team_leader',
    'team_member'
  ) then
    return new;
  end if;

  if child_role = 'global_manager' then
    if new.reports_to is not null then
      raise exception 'Global Managers cannot report to another hierarchy role';
    end if;
    return new;
  end if;

  expected_parent_role := case child_role
    when 'country_manager' then 'global_manager'
    when 'state_manager' then 'country_manager'
    when 'divisional_manager' then 'state_manager'
    when 'district_manager' then 'divisional_manager'
    when 'team_manager' then 'district_manager'
    when 'team_leader' then 'team_manager'
    when 'team_member' then 'team_leader'
  end;

  if new.reports_to is null or new.reports_to = new.id then
    raise exception 'A hierarchy role must report to its immediate parent role';
  end if;

  select public.normalize_hierarchy_role(parent.role), parent.status
    into actual_parent_role, actual_parent_status
    from public.staff parent
    where parent.id = new.reports_to;

  if not found or actual_parent_role is distinct from expected_parent_role then
    raise exception 'Invalid hierarchy parent: % must report to %', child_role, expected_parent_role;
  end if;
  if actual_parent_status not in ('active', 'approved') then
    raise exception 'Hierarchy parent must be active or approved';
  end if;

  return new;
end
$$;

drop trigger if exists staff_hierarchy_enforcement on public.staff;
create trigger staff_hierarchy_enforcement
  before insert or update of role, reports_to on public.staff
  for each row execute function public.enforce_staff_hierarchy();

create or replace function public.sync_staff_parent_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set parent_id = new.reports_to
  where user_id = new.id
    and parent_id is distinct from new.reports_to;
  return new;
end
$$;

create or replace function public.sync_profile_parent_from_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select staff.reports_to
    into new.parent_id
    from public.staff
    where staff.id = new.user_id;
  return new;
end
$$;

revoke all on function public.sync_staff_parent_to_profile() from public, anon, authenticated;
revoke all on function public.sync_profile_parent_from_staff() from public, anon, authenticated;

drop trigger if exists staff_parent_profile_sync on public.staff;
create trigger staff_parent_profile_sync
  after insert or update of reports_to on public.staff
  for each row execute function public.sync_staff_parent_to_profile();

drop trigger if exists profile_parent_staff_sync on public.profiles;
create trigger profile_parent_staff_sync
  before insert or update of parent_id on public.profiles
  for each row execute function public.sync_profile_parent_from_staff();

create or replace function public.hierarchy_task_summary()
returns table(
  total_tasks integer,
  pending_tasks integer,
  in_progress_tasks integer,
  completed_tasks integer,
  rejected_tasks integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive descendants(id) as (
    select staff.id
    from public.staff
    where staff.id = auth.uid()
      and staff.status in ('active', 'approved')
    union
    select child.id
    from public.staff child
    join descendants parent on child.reports_to = parent.id
    where child.status in ('active', 'approved')
  )
  select
    count(*)::integer,
    count(*) filter (where task.status = 'pending')::integer,
    count(*) filter (where task.status = 'in_progress')::integer,
    count(*) filter (where task.status = 'completed')::integer,
    count(*) filter (where task.status = 'rejected')::integer
  from public.tasks task
  join descendants on descendants.id = task.assigned_to
  where descendants.id <> auth.uid()
$$;

revoke all on function public.hierarchy_task_summary() from public, anon;
grant execute on function public.hierarchy_task_summary() to authenticated, service_role;

comment on column public.profiles.parent_id is
  'Read-only mirror of staff.reports_to; hierarchy authorization uses staff.reports_to.';

notify pgrst, 'reload schema';
commit;
