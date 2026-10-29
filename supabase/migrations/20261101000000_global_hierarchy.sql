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
  add column if not exists reports_to uuid references public.staff(id) on delete set null,
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists login_alias text;

create unique index if not exists staff_login_alias_unique
  on public.staff (lower(login_alias))
  where login_alias is not null;
create index if not exists staff_reports_to_idx on public.staff (reports_to);
create index if not exists staff_location_id_idx on public.staff (location_id);

alter table public.locations enable row level security;
revoke all on public.locations from public, anon, authenticated;
grant select on public.locations to authenticated;

drop policy if exists locations_authenticated_read on public.locations;
create policy locations_authenticated_read on public.locations
  for select to authenticated
  using (auth.uid() is not null);

create or replace function public.hierarchy_direct_reports()
returns table(
  id uuid,
  name text,
  role text,
  status text,
  login_alias text,
  location_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.role, s.status, s.login_alias, s.location_id
  from public.staff s
  where auth.uid() is not null and s.reports_to = auth.uid()
  order by s.created_at
$$;

revoke all on function public.hierarchy_direct_reports() from public, anon;
grant execute on function public.hierarchy_direct_reports() to authenticated, service_role;

create or replace function public.team_can_manage_member(_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.team_is_superadmin()
    or (
      exists (
        select 1 from public.staff actor
        where actor.id = auth.uid()
          and lower(replace(actor.role, '_', ' ')) = 'team manager'
      )
      and exists (
        select 1 from public.staff direct_report
        where direct_report.id = _staff_id and direct_report.reports_to = auth.uid()
      )
    )
    or exists (
      select 1 from public.teams t
      join public.staff actor on actor.id = auth.uid()
      where t.is_active
        and lower(replace(actor.role, '_', ' ')) <> 'team manager'
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

revoke all on function public.team_can_manage_member(uuid) from public, anon;
grant execute on function public.team_can_manage_member(uuid) to authenticated, service_role;

create or replace function public.team_member_directory()
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
        actor_role = 'team manager'
        and s.reports_to = actor
      )
      or (
        actor_role = 'manager'
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

revoke all on function public.team_member_directory() from public, anon;
grant execute on function public.team_member_directory() to authenticated, service_role;

grant all on public.locations to service_role;

commit;
