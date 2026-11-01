begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  message text not null check (length(trim(message)) between 1 and 5000),
  is_read boolean not null default false,
  task_id uuid references public.tasks(id) on delete set null,
  review_url text,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc)
  where not is_read;

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy notifications_read_own
  on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_own_read
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.broadcast_staff_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  is_admin boolean := public.report_access_level() = 'super_admin';
  actor_role text;
  options jsonb;
begin
  if actor is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;

  if not is_admin then
    select public.normalize_hierarchy_role(staff.role)
      into actor_role
    from public.staff
    where id = actor and status in ('active', 'approved');
    if actor_role is null or actor_role = 'team_member' then
      raise exception 'Active manager access required' using errcode = '42501';
    end if;
  end if;

  with recursive scope(user_id) as (
    select actor
    union
    select staff.id
    from public.staff
    join scope on staff.reports_to = scope.user_id
  )
  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', team.id,
          'label', coalesce(nullif(leader.name, ''), leader.unique_id, 'Team') ||
            ' · ' || coalesce(nullif(manager.name, ''), manager.unique_id, 'Manager')
        ) order by team.created_at
      )
      from public.teams team
      left join public.staff leader on leader.id = team.team_leader_id
      left join public.staff manager on manager.id = team.manager_id
      where team.is_active
        and (is_admin or exists (
          select 1 from scope
          where scope.user_id in (team.manager_id, team.team_leader_id)
        ))
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(role_row.role order by role_row.role)
      from (
        select distinct public.normalize_hierarchy_role(staff.role) as role
        from public.staff
        where public.normalize_hierarchy_role(staff.role) in (
            'global_manager', 'country_manager', 'state_manager',
            'divisional_manager', 'district_manager', 'team_manager',
            'team_leader', 'team_member'
          )
          and (is_admin or exists (
            select 1 from scope where scope.user_id = staff.id
          ))
      ) role_row
    ), '[]'::jsonb)
  ) into options;

  return options;
end
$$;

create or replace function public.broadcast_staff(
  _title text,
  _message text,
  _audience text,
  _team_id uuid default null,
  _role text default null,
  _review_url text default null,
  _create_task boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  is_admin boolean := public.report_access_level() = 'super_admin';
  actor_role text;
  selected_role text := public.normalize_hierarchy_role(_role);
  recipient record;
  team public.teams%rowtype;
  created_task uuid;
  recipient_count integer := 0;
  task_count integer := 0;
  active_count integer := 0;
  inactive_count integer := 0;
  normalized_url text := nullif(trim(_review_url), '');
begin
  if actor is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  if length(trim(coalesce(_title, ''))) not between 1 and 160
     or length(trim(coalesce(_message, ''))) not between 1 and 5000 then
    raise exception 'Enter a title and a message (up to 5000 characters)';
  end if;
  if _audience is null
     or _audience not in ('all_staff', 'specific_team', 'specific_role') then
    raise exception 'Select a supported audience';
  end if;
  if _audience = 'specific_team' and _team_id is null then
    raise exception 'Select a team';
  end if;
  if _audience = 'specific_role' and selected_role not in (
    'global_manager', 'country_manager', 'state_manager',
    'divisional_manager', 'district_manager', 'team_manager',
    'team_leader', 'team_member'
  ) then
    raise exception 'Select a supported staff role';
  end if;
  if normalized_url is not null and normalized_url !~* (
    '^https://([a-z0-9-]+\.)*google\.[a-z]{2,}(\.[a-z]{2})?([/:?#]|$)'
    || '|^https://(maps\.app\.goo\.gl|goo\.gl|g\.page)([/:?#]|$)'
  ) then
    raise exception 'Enter a valid Google review URL';
  end if;
  if normalized_url is not null and not coalesce(_create_task, false) then
    raise exception 'A Google review URL can only be included with a task';
  end if;

  if not is_admin then
    select public.normalize_hierarchy_role(staff.role)
      into actor_role
    from public.staff
    where id = actor and status in ('active', 'approved');
    if actor_role is null or actor_role = 'team_member' then
      raise exception 'Active manager access required' using errcode = '42501';
    end if;
  end if;

  if _audience = 'specific_team' and not exists (
    select 1
    from public.teams team
    where team.id = _team_id
      and team.is_active
      and (
        is_admin
        or team.manager_id = actor
        or team.team_leader_id = actor
        or exists (
          with recursive scope(user_id) as (
            select actor
            union
            select staff.id
            from public.staff
            join scope on staff.reports_to = scope.user_id
          )
          select 1 from scope
          where scope.user_id in (team.manager_id, team.team_leader_id)
        )
      )
  ) then
    raise exception 'You cannot broadcast to that team' using errcode = '42501';
  end if;

  if _audience = 'specific_role' and not is_admin and not exists (
    with recursive scope(user_id) as (
      select actor
      union
      select staff.id
      from public.staff
      join scope on staff.reports_to = scope.user_id
    )
    select 1
    from public.staff
    join scope on scope.user_id = staff.id
    where public.normalize_hierarchy_role(staff.role) = selected_role
  ) then
    raise exception 'That role is outside your staff scope' using errcode = '42501';
  end if;

  if _create_task then
    perform pg_catalog.set_config('app.broadcast_staff', 'on', true);
  end if;

  for recipient in
    with recursive scope(user_id) as (
      select actor
      union
      select staff.id
      from public.staff
      join scope on staff.reports_to = scope.user_id
    )
    select distinct
      staff.id,
      staff.status,
      public.normalize_hierarchy_role(staff.role) as hierarchy_role,
      staff.team_id,
      staff.manager_id,
      staff.team_leader_id
    from public.staff
    where (
      staff.status in ('active', 'approved')
      or not coalesce(_create_task, false)
    )
      and public.normalize_hierarchy_role(staff.role) in (
        'global_manager', 'country_manager', 'state_manager',
        'divisional_manager', 'district_manager', 'team_manager',
        'team_leader', 'team_member'
      )
      and (is_admin or exists (
        select 1 from scope where scope.user_id = staff.id
      ))
      and (
        _audience = 'all_staff'
        or (
          _audience = 'specific_role'
          and public.normalize_hierarchy_role(staff.role) = selected_role
        )
        or (
          _audience = 'specific_team'
          and (
            staff.id in (
              select team.manager_id from public.teams team
              where team.id = _team_id and team.is_active
              union
              select team.team_leader_id from public.teams team
              where team.id = _team_id and team.is_active
              union
              select member.id
              from public.staff member
              join public.teams team on team.is_active
              where team.id = _team_id
                and (
                  member.team_id = team.id
                  or (
                    member.team_leader_id = team.team_leader_id
                    and member.manager_id = team.manager_id
                  )
                )
            )
          )
        )
      )
  loop
    recipient_count := recipient_count + 1;
    if recipient_count > 5000 then
      raise exception 'Broadcast audience exceeds the 5000-recipient limit';
    end if;
    if recipient.status in ('active', 'approved') then
      active_count := active_count + 1;
    else
      inactive_count := inactive_count + 1;
    end if;

    created_task := null;
    if _create_task then
      select * into team
      from public.teams candidate
      where candidate.is_active
        and (
          candidate.id = recipient.team_id
          or candidate.manager_id = recipient.id
          or candidate.team_leader_id = recipient.id
          or (
            recipient.team_leader_id is not null
            and candidate.team_leader_id = recipient.team_leader_id
            and candidate.manager_id = recipient.manager_id
          )
        )
      order by (candidate.id = recipient.team_id) desc, candidate.created_at
      limit 1;

      insert into public.tasks (
        team_id, manager_id, team_leader_id, assigned_to, assigned_role,
        created_by, title, description, review_url
      ) values (
        team.id,
        coalesce(recipient.manager_id, team.manager_id),
        coalesce(recipient.team_leader_id, team.team_leader_id),
        recipient.id,
        case recipient.hierarchy_role
          when 'global_manager' then 'Global Manager'
          when 'country_manager' then 'Country Manager'
          when 'state_manager' then 'State Manager'
          when 'divisional_manager' then 'Divisional Manager'
          when 'district_manager' then 'District Manager'
          when 'team_manager' then 'Manager'
          when 'team_leader' then 'Team Leader'
          else 'Staff'
        end,
        actor, trim(_title), trim(_message), normalized_url
      ) returning id into created_task;
      task_count := task_count + 1;
    end if;

    insert into public.notifications (user_id, title, message, task_id, review_url)
    values (recipient.id, trim(_title), trim(_message), created_task, normalized_url);
  end loop;

  if _create_task then
    perform pg_catalog.set_config('app.broadcast_staff', 'off', true);
  end if;
  if recipient_count = 0 then
    raise exception 'No staff members match this audience';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, details)
  values (
    actor,
    'staff_broadcast',
    'notification_broadcast',
    jsonb_build_object(
      'audience', _audience,
      'team_id', case when _audience = 'specific_team' then _team_id end,
      'role', case when _audience = 'specific_role' then selected_role end,
      'notifications_sent', recipient_count,
      'active_recipients', active_count,
      'inactive_recipients', inactive_count,
      'tasks_created', task_count
    )
  );

  return jsonb_build_object(
    'notifications_sent', recipient_count,
    'active_recipients', active_count,
    'inactive_recipients', inactive_count,
    'tasks_created', task_count
  );
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
  if actor_id is null or public.team_is_superadmin()
     or pg_catalog.current_setting('app.broadcast_staff', true) = 'on' then
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

revoke all on function public.broadcast_staff_options() from public, anon;
revoke all on function public.broadcast_staff(text, text, text, uuid, text, text, boolean)
  from public, anon;
grant execute on function public.broadcast_staff_options() to authenticated;
grant execute on function public.broadcast_staff(text, text, text, uuid, text, text, boolean)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
