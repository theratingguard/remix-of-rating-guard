begin;

alter table public.tasks
  add column if not exists review_url text,
  add column if not exists review_text text,
  add column if not exists reviewer_name text,
  add column if not exists reviewer_profile_url text;

create index if not exists staff_activity_task_reported_idx
  on public.staff_activity_log (created_at desc)
  where action = 'task_reported';

drop function if exists public.create_team_tasks(text, text, uuid[], timestamptz);
drop function if exists public.create_team_tasks(text, text, uuid[], text, timestamptz);

create function public.create_team_tasks(
  _title text,
  _description text,
  _assignees uuid[],
  _review_url text,
  _deadline_at timestamptz default null
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
  reviewer_name text;
  reviewer_profile_url text;
  review_text text;
  created_count integer := 0;
begin
  if actor is null then raise exception 'Sign in required'; end if;
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
  if coalesce(cardinality(_assignees), 0) = 0 or cardinality(_assignees) > 100 then
    raise exception 'Select between 1 and 100 assignees';
  end if;
  if (select count(distinct selected.id) from unnest(_assignees) as selected(id))
       <> cardinality(_assignees) then
    raise exception 'An assignee was selected more than once';
  end if;

  select coalesce(review.author, 'Anonymous'), review.author_uri, review.text
    into reviewer_name, reviewer_profile_url, review_text
    from public.reviews as review
    where review.review_uri = trim(_review_url)
       or review.review_url = trim(_review_url)
    order by review.created_at desc nulls last
    limit 1;
  if not found then
    raise exception 'Review URL was not found in the local review database. Scan or import it first.';
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
      created_by, title, description, review_url, review_text,
      reviewer_name, reviewer_profile_url, deadline_at
    ) values (
      team.id, team.manager_id, team.team_leader_id, target.id,
      case when is_team_leader then 'Team Leader' else 'Staff' end,
      actor, trim(_title), coalesce(_description, ''), trim(_review_url), review_text,
      reviewer_name, reviewer_profile_url, _deadline_at
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
  action_time timestamptz := now();
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
        completed_at = case when _status = 'completed' then action_time else null end,
        updated_at = action_time
    where id = _task_id;

  if _status = 'completed'
     and actor = task.assigned_to
     and task.assigned_role = 'Staff'
     and task.review_url is not null then
    insert into public.staff_activity_log (staff_id, action, metadata, created_at)
    values (
      actor,
      'task_reported',
      jsonb_build_object(
        'task_id', task.id,
        'staff_id', actor,
        'review_url', task.review_url,
        'reported_at', action_time
      ),
      action_time
    );
  end if;
  return _task_id;
end
$$;

create or replace function public.credit_team_task_completion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  reward record;
begin
  if old.status is distinct from 'completed' and new.status = 'completed' then
    for reward in
      select distinct on (recipient.staff_id)
        recipient.staff_id, recipient.earning_type, recipient.amount_inr
      from (
        values
          (case when new.assigned_role = 'Staff' then new.assigned_to else null end,
            'staff_task'::text, 30),
          (new.team_leader_id, 'team_leader_task'::text, 40),
          (new.manager_id, 'manager_task'::text, 90)
      ) as recipient(staff_id, earning_type, amount_inr)
      where recipient.staff_id is not null
      order by recipient.staff_id, recipient.amount_inr desc
    loop
      insert into public.team_task_earnings (task_id, staff_id, earning_type, amount_inr)
      values (new.id, reward.staff_id, reward.earning_type, reward.amount_inr)
      on conflict (task_id, staff_id, earning_type) do nothing;
    end loop;
  end if;
  return new;
end
$$;

revoke all on function public.create_team_tasks(text, text, uuid[], text, timestamptz)
  from public, anon;
grant execute on function public.create_team_tasks(text, text, uuid[], text, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';
commit;
