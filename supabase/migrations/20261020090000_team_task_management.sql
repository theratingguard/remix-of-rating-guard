begin;

alter table public.staff
  add column manager_id uuid references public.staff(id) on delete set null,
  add column team_leader_id uuid references public.staff(id) on delete set null;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.staff(id) on delete restrict,
  team_leader_id uuid not null unique references public.staff(id) on delete restrict,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (manager_id <> team_leader_id)
);
create index teams_manager_active_idx on public.teams (manager_id, created_at desc) where is_active;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  manager_id uuid not null references public.staff(id) on delete restrict,
  team_leader_id uuid not null references public.staff(id) on delete restrict,
  assigned_to uuid not null references public.staff(id) on delete restrict,
  assigned_role text not null check (assigned_role in ('Manager', 'Team Leader', 'Staff')),
  created_by uuid not null references auth.users(id),
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 5000),
  deadline_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'rejected')),
  status_note text check (status_note is null or length(status_note) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null))
);
create index tasks_assignee_status_created_idx on public.tasks (assigned_to, status, created_at desc);
create index tasks_team_status_created_idx on public.tasks (team_id, status, created_at desc);
create index tasks_manager_created_idx on public.tasks (manager_id, created_at desc);
create index tasks_leader_created_idx on public.tasks (team_leader_id, created_at desc);

create table public.team_task_earnings (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete restrict,
  earning_type text not null check (earning_type in ('staff_task', 'team_leader_task', 'manager_task')),
  amount_inr integer not null check (amount_inr > 0),
  created_at timestamptz not null default now(),
  unique (task_id, staff_id, earning_type)
);
create index team_task_earnings_staff_created_idx
  on public.team_task_earnings (staff_id, created_at desc);

alter table public.teams enable row level security;
alter table public.tasks enable row level security;
alter table public.team_task_earnings enable row level security;
revoke all on public.teams, public.tasks, public.team_task_earnings from public, anon, authenticated;
grant select on public.teams, public.tasks, public.team_task_earnings to authenticated;
grant all on public.teams, public.tasks, public.team_task_earnings to service_role;

create or replace function public.team_is_superadmin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and public.report_access_level() = 'super_admin'
$$;

create or replace function public.team_can_manage_member(_staff_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    public.team_is_superadmin()
    or exists (
      select 1 from public.teams t
      where t.is_active
        and (
          (t.manager_id = auth.uid() and (
            t.team_leader_id = _staff_id
            or exists (
              select 1 from public.staff s
              where s.id = _staff_id
                and s.team_leader_id = t.team_leader_id
                and s.manager_id = t.manager_id
            )
          ))
          or (t.team_leader_id = auth.uid() and exists (
            select 1 from public.staff s
            where s.id = _staff_id
              and s.team_leader_id = t.team_leader_id
              and s.manager_id = t.manager_id
          ))
        )
    )
  )
$$;

create or replace function public.team_can_read_task(_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    public.team_is_superadmin()
    or exists (
      select 1 from public.tasks task
      join public.teams team on team.id = task.team_id and team.is_active
      where task.id = _task_id and (
        task.assigned_to = auth.uid()
        or task.created_by = auth.uid()
        or team.manager_id = auth.uid()
        or team.team_leader_id = auth.uid()
      )
    )
  )
$$;

revoke all on function public.team_is_superadmin() from public, anon;
revoke all on function public.team_can_manage_member(uuid) from public, anon;
revoke all on function public.team_can_read_task(uuid) from public, anon;
grant execute on function public.team_is_superadmin() to authenticated, service_role;
grant execute on function public.team_can_manage_member(uuid) to authenticated, service_role;
grant execute on function public.team_can_read_task(uuid) to authenticated, service_role;

create policy teams_read_own_scope on public.teams
  for select to authenticated
  using (
    public.team_is_superadmin()
    or manager_id = auth.uid()
    or team_leader_id = auth.uid()
  );
create policy tasks_read_own_scope on public.tasks
  for select to authenticated
  using (public.team_can_read_task(id));
create policy team_task_earnings_read_own_scope on public.team_task_earnings
  for select to authenticated
  using (staff_id = auth.uid() or public.team_can_manage_member(staff_id));

drop policy if exists staff_profile_read on public.staff;
create policy staff_profile_read on public.staff
  for select to authenticated
  using (
    id = auth.uid()
    or public.team_is_superadmin()
    or public.team_can_manage_member(id)
    or public.can_review_staff_activity(id)
  );
drop policy if exists staff_team_lead_activity_read on public.staff;

create or replace function public.admin_create_team(_manager_id uuid, _team_leader_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  created_team uuid;
begin
  if actor is null or not public.team_is_superadmin() then
    raise exception 'Superadmin access required';
  end if;
  if _manager_id = _team_leader_id then raise exception 'Manager and team leader must differ'; end if;
  if not exists (
    select 1 from public.staff
    where id = _manager_id and status in ('approved', 'active')
      and lower(role) not in ('team leader', 'team_leader', 'team lead', 'tl')
      and manager_id is null and team_leader_id is null
  ) then raise exception 'Select an approved manager profile'; end if;
  if not exists (
    select 1 from public.staff
    where id = _team_leader_id and status in ('approved', 'active')
      and lower(role) <> 'manager'
      and manager_id is null and team_leader_id is null
  ) then raise exception 'Select an approved team leader profile'; end if;
  if exists (select 1 from public.teams where team_leader_id = _team_leader_id) then
    raise exception 'This team leader is already assigned to a team';
  end if;
  update public.staff set role = 'Manager', updated_at = now() where id = _manager_id;
  update public.staff
    set role = 'Team Leader', manager_id = _manager_id, team_leader_id = _team_leader_id,
        team_lead = _team_leader_id::text, updated_at = now()
    where id = _team_leader_id;
  insert into public.teams (manager_id, team_leader_id, created_by)
    values (_manager_id, _team_leader_id, actor)
    returning id into created_team;
  return created_team;
end
$$;

create or replace function public.admin_assign_staff_to_team(_staff_id uuid, _team_leader_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  team public.teams%rowtype;
begin
  if auth.uid() is null or not public.team_is_superadmin() then
    raise exception 'Superadmin access required';
  end if;
  select * into team from public.teams
    where team_leader_id = _team_leader_id and is_active;
  if not found then raise exception 'Active team not found'; end if;
  if not exists (
    select 1 from public.staff
    where id = _staff_id and status in ('approved', 'active')
      and lower(role) not in ('manager', 'team leader', 'team_leader', 'team lead', 'tl')
  ) then raise exception 'Select an approved staff profile'; end if;
  update public.staff
    set role = 'Staff', manager_id = team.manager_id, team_leader_id = team.team_leader_id,
        team_lead = team.team_leader_id::text, updated_at = now()
    where id = _staff_id;
  return _staff_id;
end
$$;

create or replace function public.team_leader_pending_staff()
returns table(id uuid, name text, email text, mobile text, region_city text, region_state text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.teams t where t.team_leader_id = auth.uid() and t.is_active
  ) then raise exception 'Active team leader access required'; end if;
  return query
    select s.id, s.name, s.email, s.mobile, s.region_city, s.region_state, s.created_at
    from public.staff s
    join public.staff leader on leader.id = auth.uid()
    where s.status = 'pending'
      and s.team_leader_id is null and s.manager_id is null
      and s.team_lead in (leader.id::text, leader.name)
    order by s.created_at asc
    limit 100;
end
$$;

create or replace function public.team_leader_add_staff(_staff_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  team public.teams%rowtype;
begin
  select * into team from public.teams
    where team_leader_id = actor and is_active for update;
  if actor is null or not found then raise exception 'Active team leader access required'; end if;
  update public.staff
    set status = 'approved', role = 'Staff', manager_id = team.manager_id,
        team_leader_id = team.team_leader_id, team_lead = team.team_leader_id::text,
        approved_by = actor, approved_at = now(), updated_at = now()
    where id = _staff_id and status = 'pending'
      and manager_id is null and team_leader_id is null
      and team_lead in (
        team.team_leader_id::text,
        (select leader.name from public.staff leader where leader.id = team.team_leader_id)
      );
  if not found then raise exception 'Pending unassigned staff application not found'; end if;
  insert into public.staff_activity_log (staff_id, action, metadata)
    values (_staff_id, 'team_leader_approved', jsonb_build_object('team_leader_id', actor));
  return _staff_id;
end
$$;

create or replace function public.create_team_tasks(
  _title text, _description text, _assignees uuid[], _deadline_at timestamptz default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  assignee uuid;
  target public.staff%rowtype;
  team public.teams%rowtype;
  created_count integer := 0;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if length(trim(coalesce(_title, ''))) not between 1 and 160
     or length(coalesce(_description, '')) > 5000 then
    raise exception 'Task title or description is invalid';
  end if;
  if coalesce(cardinality(_assignees), 0) = 0 or cardinality(_assignees) > 100 then
    raise exception 'Select between 1 and 100 assignees';
  end if;
  if (select count(distinct selected.id) from unnest(_assignees) as selected(id))
       <> cardinality(_assignees) then
    raise exception 'An assignee was selected more than once';
  end if;
  foreach assignee in array _assignees loop
    select * into target from public.staff where id = assignee
      and status in ('approved', 'active');
    if not found then raise exception 'Assignee is not an approved staff member'; end if;
    if lower(target.role) in ('team leader', 'team_leader') then
      select * into team from public.teams
        where team_leader_id = target.id and is_active;
    else
      select * into team from public.teams
        where team_leader_id = target.team_leader_id and manager_id = target.manager_id and is_active;
    end if;
    if not found then raise exception 'Assignee does not belong to an active team'; end if;
    if not public.team_is_superadmin() then
      if not (
        (actor = team.manager_id)
        or (actor = team.team_leader_id and target.id <> team.team_leader_id)
      ) then raise exception 'You cannot assign tasks outside your team scope'; end if;
    end if;
    insert into public.tasks (
      team_id, manager_id, team_leader_id, assigned_to, assigned_role,
      created_by, title, description, deadline_at
    ) values (
      team.id, team.manager_id, team.team_leader_id, target.id,
      case when lower(target.role) in ('team leader', 'team_leader') then 'Team Leader' else 'Staff' end,
      actor, trim(_title), coalesce(_description, ''), _deadline_at
    );
    created_count := created_count + 1;
  end loop;
  return created_count;
end
$$;

create or replace function public.update_team_task(
  _task_id uuid, _status text, _status_note text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  task public.tasks%rowtype;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if _status not in ('in_progress', 'completed', 'rejected') then
    raise exception 'Unsupported task status';
  end if;
  select * into task from public.tasks where id = _task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if (actor = task.assigned_to or public.team_is_superadmin())
     and _status in ('in_progress', 'completed') then
    if (_status = 'in_progress' and task.status <> 'pending')
       or (_status = 'completed' and task.status <> 'in_progress') then
      raise exception 'Invalid task status transition';
    end if;
  elsif _status = 'rejected' and (
    public.team_is_superadmin()
    or (task.manager_id = actor and exists (
      select 1 from public.teams t where t.id = task.team_id and t.manager_id = actor and t.is_active
    ))
    or (task.team_leader_id = actor and exists (
      select 1 from public.teams t where t.id = task.team_id and t.team_leader_id = actor and t.is_active
    ))
  ) then
    if task.status not in ('pending', 'in_progress') then
      raise exception 'Only pending or in-progress tasks may be rejected';
    end if;
    if length(trim(coalesce(_status_note, ''))) not between 1 and 1000 then
      raise exception 'A rejection reason is required';
    end if;
  else
    raise exception 'You are not authorized to update this task';
  end if;
  update public.tasks
    set status = _status,
        status_note = case when _status = 'rejected' then trim(_status_note) else null end,
        completed_at = case when _status = 'completed' then now() else null end,
        updated_at = now()
    where id = _task_id;
  return _task_id;
end
$$;

create or replace function public.credit_team_task_completion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status is distinct from 'completed' and new.status = 'completed' then
    if new.assigned_role = 'Staff' then
      insert into public.team_task_earnings (task_id, staff_id, earning_type, amount_inr)
        values (new.id, new.assigned_to, 'staff_task', 90)
        on conflict (task_id, staff_id, earning_type) do nothing;
    end if;
    insert into public.team_task_earnings (task_id, staff_id, earning_type, amount_inr)
      values (new.id, new.team_leader_id, 'team_leader_task', 40)
      on conflict (task_id, staff_id, earning_type) do nothing;
    insert into public.team_task_earnings (task_id, staff_id, earning_type, amount_inr)
      values (new.id, new.manager_id, 'manager_task', 20)
      on conflict (task_id, staff_id, earning_type) do nothing;
  end if;
  return new;
end
$$;

drop trigger if exists team_task_completion_earnings on public.tasks;
create trigger team_task_completion_earnings
  after update of status on public.tasks
  for each row execute function public.credit_team_task_completion();

revoke all on function public.admin_create_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_assign_staff_to_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.team_leader_pending_staff() from public, anon;
revoke all on function public.team_leader_add_staff(uuid) from public, anon;
revoke all on function public.create_team_tasks(text, text, uuid[], timestamptz) from public, anon;
revoke all on function public.update_team_task(uuid, text, text) from public, anon;
revoke all on function public.credit_team_task_completion() from public, anon, authenticated;
grant execute on function public.admin_create_team(uuid, uuid) to authenticated;
grant execute on function public.admin_assign_staff_to_team(uuid, uuid) to authenticated;
grant execute on function public.team_leader_pending_staff() to authenticated;
grant execute on function public.team_leader_add_staff(uuid) to authenticated;
grant execute on function public.create_team_tasks(text, text, uuid[], timestamptz) to authenticated;
grant execute on function public.update_team_task(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
