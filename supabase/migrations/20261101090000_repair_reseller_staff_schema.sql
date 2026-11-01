begin;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  country text,
  state text,
  division text,
  district text,
  city text,
  created_at timestamptz not null default now(),
  check (nullif(trim(coalesce(country, '')), '') is not null)
);

alter table public.staff
  add column if not exists mobile_number text,
  add column if not exists photo_url text,
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists reports_to uuid references public.staff(id) on delete set null,
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists login_alias text,
  add column if not exists unique_id text;

update public.staff
set mobile_number = mobile
where mobile_number is null;

alter table public.staff
  alter column mobile_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.staff'::regclass
      and conname = 'staff_mobile_number_length_check'
  ) then
    alter table public.staff
      add constraint staff_mobile_number_length_check
      check (length(trim(mobile_number)) between 6 and 32);
  end if;
end
$$;

create index if not exists staff_reports_to_idx on public.staff (reports_to);
create index if not exists staff_location_id_idx on public.staff (location_id);
create index if not exists staff_team_id_idx on public.staff (team_id);
create unique index if not exists staff_login_alias_unique
  on public.staff (lower(login_alias)) where login_alias is not null;

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

update public.staff child
set reports_to = parent.id
from public.staff parent
where child.reports_to is null
  and public.normalize_hierarchy_role(child.role) = 'team_leader'
  and child.manager_id = parent.id
  and public.normalize_hierarchy_role(parent.role) = 'team_manager'
  and parent.status in ('active', 'approved');

update public.staff child
set reports_to = parent.id
from public.staff parent
where child.reports_to is null
  and public.normalize_hierarchy_role(child.role) = 'team_member'
  and child.team_leader_id = parent.id
  and public.normalize_hierarchy_role(parent.role) = 'team_leader'
  and parent.status in ('active', 'approved');

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
  case public.normalize_hierarchy_role(_role)
    when 'team_manager' then digits := 4;
    when 'team_leader' then digits := 6;
    else digits := 8;
  end case;
  lower_bound := power(10::numeric, digits - 1)::bigint;
  perform pg_catalog.pg_advisory_xact_lock(740291);
  loop
    attempts := attempts + 1;
    if attempts > 9 * lower_bound then
      raise exception 'No unique staff ID is available for this role';
    end if;
    candidate := (lower_bound + floor(random() * (9 * lower_bound))::bigint)::text;
    exit when not exists (
      select 1 from public.staff staff where staff.unique_id = candidate
    );
  end loop;
  return candidate;
end
$$;

update public.staff
set unique_id = public.generate_staff_unique_id(role)
where unique_id is null;

alter table public.staff
  alter column unique_id set not null;

create unique index if not exists staff_unique_id_unique on public.staff (unique_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.staff'::regclass
      and conname = 'staff_unique_id_role_length_check'
  ) then
    alter table public.staff
      add constraint staff_unique_id_role_length_check
      check (
        unique_id ~ '^[0-9]{4}$'
          and public.normalize_hierarchy_role(role) = 'team_manager'
        or unique_id ~ '^[0-9]{6}$'
          and public.normalize_hierarchy_role(role) = 'team_leader'
        or unique_id ~ '^[0-9]{8}$'
          and public.normalize_hierarchy_role(role) not in ('team_manager', 'team_leader')
      );
  end if;
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

create or replace function public.sync_staff_mobile_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.mobile := coalesce(nullif(btrim(new.mobile), ''), new.mobile_number);
    new.mobile_number := coalesce(nullif(btrim(new.mobile_number), ''), new.mobile);
  elsif new.mobile is distinct from old.mobile then
    new.mobile_number := new.mobile;
  elsif new.mobile_number is distinct from old.mobile_number then
    new.mobile := new.mobile_number;
  end if;
  return new;
end
$$;

drop trigger if exists sync_staff_mobile_number on public.staff;
create trigger sync_staff_mobile_number
  before insert or update of mobile, mobile_number on public.staff
  for each row execute function public.sync_staff_mobile_number();

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
    'global_manager', 'country_manager', 'state_manager', 'divisional_manager',
    'district_manager', 'team_manager', 'team_leader', 'team_member'
  ) then
    return new;
  end if;
  if child_role = 'global_manager' then
    if new.reports_to is not null then
      raise exception 'Global Managers cannot report to another hierarchy role';
    end if;
    return new;
  end if;
  if child_role = 'team_leader'
    and new.reports_to is null
    and new.approved_by is not null
    and exists (
      select 1
      from public.reseller_profiles reseller
      where reseller.user_id = new.approved_by
        and reseller.status not in ('rejected', 'suspended')
    )
  then
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

alter table public.locations enable row level security;
revoke all on public.locations from public, anon, authenticated;
grant select on public.locations to authenticated;
drop policy if exists locations_authenticated_read on public.locations;
create policy locations_authenticated_read on public.locations
  for select to authenticated using (auth.uid() is not null);

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
      select staff.id, staff.unique_id from public.staff staff;
  else
    return query
      select staff.id, staff.unique_id
      from public.staff staff
      where staff.id = actor
         or staff.id = public.internal_chat_super_admin_id();
  end if;
end
$$;

revoke all on function public.internal_chat_user_ids() from public, anon;
grant execute on function public.internal_chat_user_ids() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
