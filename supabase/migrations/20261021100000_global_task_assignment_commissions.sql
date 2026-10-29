begin;

alter table public.tasks
  alter column team_id drop not null,
  alter column manager_id drop not null,
  alter column team_leader_id drop not null;

create table public.staff_case_earnings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.staff_cases(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete restrict,
  earning_type text not null check (
    earning_type in ('staff_task', 'team_leader_task', 'manager_task')
  ),
  amount_inr integer not null check (amount_inr > 0),
  created_at timestamptz not null default now(),
  unique (case_id, staff_id, earning_type)
);

create index staff_case_earnings_staff_created_idx
  on public.staff_case_earnings (staff_id, created_at desc);

alter table public.staff_case_earnings enable row level security;
revoke all on public.staff_case_earnings from public, anon, authenticated;
grant select on public.staff_case_earnings to authenticated;
grant all on public.staff_case_earnings to service_role;

create policy staff_case_earnings_read_own_scope on public.staff_case_earnings
  for select to authenticated
  using (staff_id = auth.uid() or public.team_can_manage_member(staff_id));

create or replace function public.team_can_read_task(_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    public.team_is_superadmin()
    or exists (
      select 1
      from public.tasks task
      where task.id = _task_id
        and (
          task.assigned_to = auth.uid()
          or task.created_by = auth.uid()
          or exists (
            select 1
            from public.teams team
            where team.id = task.team_id
              and team.is_active
              and (team.manager_id = auth.uid() or team.team_leader_id = auth.uid())
          )
        )
    )
  )
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
  is_admin boolean := public.team_is_superadmin();
  is_team_leader boolean;
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
    select * into target
    from public.staff
    where id = assignee and status in ('approved', 'active');
    if not found then raise exception 'Assignee is not an approved staff member'; end if;

    is_team_leader := lower(replace(target.role, '_', ' ')) in ('team leader', 'team lead', 'tl');
    if is_team_leader then
      select * into team
      from public.teams
      where team_leader_id = target.id and is_active;
    else
      select * into team
      from public.teams
      where team_leader_id = target.team_leader_id
        and manager_id = target.manager_id
        and is_active;
    end if;

    if not found then
      if not is_admin then
        raise exception 'Assignee does not belong to an active team';
      end if;
      if lower(replace(target.role, '_', ' ')) in ('manager', 'team leader', 'team lead', 'tl') then
        raise exception 'Managers and team leaders must belong to an active team';
      end if;
      team.id := null;
      team.manager_id := null;
      team.team_leader_id := null;
    elsif not is_admin and not (
      actor = team.manager_id
      or (actor = team.team_leader_id and target.id <> team.team_leader_id)
    ) then
      raise exception 'You cannot assign tasks outside your team scope';
    end if;

    insert into public.tasks (
      team_id, manager_id, team_leader_id, assigned_to, assigned_role,
      created_by, title, description, deadline_at
    ) values (
      team.id, team.manager_id, team.team_leader_id, target.id,
      case when is_team_leader then 'Team Leader' else 'Staff' end,
      actor, trim(_title), coalesce(_description, ''), _deadline_at
    );
    created_count := created_count + 1;
  end loop;
  return created_count;
end
$$;

create or replace function public.credit_staff_on_removed_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_id uuid;
  team_leader_id uuid;
  reward record;
begin
  if old.status is distinct from 'closed'
    and new.status = 'closed'
    and new.ai_status = 'removed'
    and new.staff_id is not null
  then
    select staff.manager_id, staff.team_leader_id
      into manager_id, team_leader_id
      from public.staff
      where staff.id = new.staff_id;

    for reward in
      select distinct on (recipient.staff_id)
        recipient.staff_id, recipient.earning_type, recipient.amount_inr
      from (
        values
          (new.staff_id, 'staff_task'::text, 30),
          (team_leader_id, 'team_leader_task'::text, 40),
          (manager_id, 'manager_task'::text, 90)
      ) as recipient(staff_id, earning_type, amount_inr)
      where recipient.staff_id is not null
      order by recipient.staff_id, recipient.amount_inr desc
    loop
      insert into public.staff_case_earnings (case_id, staff_id, earning_type, amount_inr)
      values (new.id, reward.staff_id, reward.earning_type, reward.amount_inr)
      on conflict (case_id, staff_id, earning_type) do nothing;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.credit_team_task_completion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status is distinct from 'completed' and new.status = 'completed' then
    if new.assigned_role = 'Staff' then
      insert into public.team_task_earnings (task_id, staff_id, earning_type, amount_inr)
        values (new.id, new.assigned_to, 'staff_task', 30)
        on conflict (task_id, staff_id, earning_type) do nothing;
    end if;
    if new.team_leader_id is not null then
      insert into public.team_task_earnings (task_id, staff_id, earning_type, amount_inr)
        values (new.id, new.team_leader_id, 'team_leader_task', 40)
        on conflict (task_id, staff_id, earning_type) do nothing;
    end if;
    if new.manager_id is not null then
      insert into public.team_task_earnings (task_id, staff_id, earning_type, amount_inr)
        values (new.id, new.manager_id, 'manager_task', 90)
        on conflict (task_id, staff_id, earning_type) do nothing;
    end if;
  end if;
  return new;
end
$$;

notify pgrst, 'reload schema';
commit;
