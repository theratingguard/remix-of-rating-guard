begin;

alter table public.staff add column if not exists unique_id text;

create or replace function public.generate_staff_unique_id(_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  digits integer;
  lower_bound bigint;
  candidate text;
  attempts bigint := 0;
begin
  case lower(replace(coalesce(_role, ''), '_', ' '))
    when 'manager' then digits := 4;
    when 'team manager' then digits := 4;
    when 'team leader' then digits := 6;
    when 'team lead' then digits := 6;
    when 'tl' then digits := 6;
    else digits := 8;
  end case;
  lower_bound := power(10::numeric, digits - 1)::bigint;

  perform pg_catalog.pg_advisory_xact_lock(740291);
  loop
    attempts := attempts + 1;
    if attempts > 9 * lower_bound then
      raise exception 'No unique staff ID is available for this role';
    end if;
    candidate := (
      lower_bound + floor(random() * (9 * lower_bound))::bigint
    )::text;
    exit when not exists (select 1 from public.staff where unique_id = candidate);
  end loop;
  return candidate;
end
$$;

create or replace function public.assign_staff_unique_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unique_id is null or (tg_op = 'UPDATE' and new.role is distinct from old.role) then
    new.unique_id := public.generate_staff_unique_id(new.role);
  end if;
  return new;
end
$$;

drop trigger if exists assign_staff_unique_id on public.staff;
create trigger assign_staff_unique_id
  before insert or update of role on public.staff
  for each row execute function public.assign_staff_unique_id();

update public.staff
set unique_id = public.generate_staff_unique_id(role)
where unique_id is null;

alter table public.staff alter column unique_id set not null;
create unique index if not exists staff_unique_id_unique on public.staff (unique_id);
alter table public.staff
  add constraint staff_unique_id_role_length_check
  check (
    unique_id ~ '^[0-9]{4}$' and lower(replace(role, '_', ' ')) in ('manager', 'team manager')
    or unique_id ~ '^[0-9]{6}$' and lower(replace(role, '_', ' ')) in ('team leader', 'team lead', 'tl')
    or unique_id ~ '^[0-9]{8}$' and lower(replace(role, '_', ' ')) not in ('manager', 'team manager', 'team leader', 'team lead', 'tl')
  );

drop policy if exists staff_profile_read on public.staff;
drop policy if exists staff_profile_read_own on public.staff;
create policy staff_profile_read_own_or_superadmin on public.staff
  for select to authenticated
  using (id = (select auth.uid()) or public.report_access_level() = 'super_admin');

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
  actor uuid := auth.uid();
  actor_role text;
begin
  select lower(replace(s.role, '_', ' '))
    into actor_role
    from public.staff s
    where s.id = actor and s.status in ('active', 'approved');
  if actor is null or coalesce(actor_role, '') not in ('manager', 'team manager', 'team leader', 'team lead', 'tl') then
    raise exception 'Active team management access required';
  end if;
  return query
    select s.id, s.unique_id, s.role, s.status, s.team_id
    from public.staff s
    where s.id = actor
      or (
        actor_role in ('manager', 'team manager')
        and (
          s.manager_id = actor
          or exists (
            select 1 from public.teams t
            where t.manager_id = actor and t.is_active
              and t.team_leader_id = s.team_leader_id
          )
        )
      )
      or (
        actor_role in ('team leader', 'team lead', 'tl')
        and s.team_leader_id = actor
      )
    order by s.unique_id;
end
$$;

revoke all on function public.generate_staff_unique_id(text) from public, anon, authenticated;
revoke all on function public.assign_staff_unique_id() from public, anon, authenticated;
revoke all on function public.team_member_directory() from public, anon;
grant execute on function public.team_member_directory() to authenticated, service_role;

drop function if exists public.team_leader_pending_staff();
create function public.team_leader_pending_staff()
returns table(id uuid, unique_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.teams t where t.team_leader_id = auth.uid() and t.is_active
  ) then raise exception 'Active team leader access required'; end if;
  return query
    select s.id, s.unique_id
    from public.staff s
    join public.staff leader on leader.id = auth.uid()
    where s.status = 'pending'
      and s.team_leader_id is null and s.manager_id is null
      and s.team_lead in (leader.id::text, leader.name)
    order by s.created_at asc
    limit 100;
end
$$;

revoke all on function public.team_leader_pending_staff() from public, anon;
grant execute on function public.team_leader_pending_staff() to authenticated, service_role;

create or replace function public.internal_chat_user_ids()
returns table(user_id uuid, unique_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if public.report_access_level() = 'super_admin' then
    return query
      select s.id, s.unique_id from public.staff s;
  else
    return query
      select s.id, s.unique_id
      from public.staff s
      where s.id = actor
         or s.id = public.internal_chat_super_admin_id();
  end if;
end
$$;

revoke all on function public.internal_chat_user_ids() from public, anon;
grant execute on function public.internal_chat_user_ids() to authenticated, service_role;

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
      and team_leader_id is null
      and (
        (
          lower(replace(role, '_', ' ')) in ('team leader', 'team lead', 'tl')
          and (manager_id is null or manager_id = _manager_id)
        )
        or (
          lower(replace(role, '_', ' ')) not in ('manager', 'team manager', 'team leader', 'team lead', 'tl')
          and manager_id is null
        )
      )
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
  update public.staff set team_id = created_team, updated_at = now()
    where id = _team_leader_id;
  return created_team;
end
$$;

notify pgrst, 'reload schema';
commit;
