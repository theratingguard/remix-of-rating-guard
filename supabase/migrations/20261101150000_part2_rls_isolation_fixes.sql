begin;

-- A display name is user-editable and is not a stable staff identity. Do not
-- use it to authorize access to staff activity or pending-staff assignment.
create or replace function public.can_review_staff_activity(_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.report_access_level() = 'super_admin'
    or exists (
      select 1
      from public.staff target
      join public.staff lead on lead.id = auth.uid()
      where target.id = _staff_id
        and target.team_lead = lead.id::text
        and lead.status in ('approved', 'active')
        and lower(lead.role) in ('team lead', 'team_lead')
    )
  )
$$;

create or replace function public.team_leader_pending_staff()
returns table(id uuid, unique_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.teams t
    where t.team_leader_id = auth.uid() and t.is_active
  ) then
    raise exception 'Active team leader access required';
  end if;

  return query
    select s.id, s.unique_id
    from public.staff s
    join public.staff leader on leader.id = auth.uid()
    where s.status = 'pending'
      and s.team_leader_id is null
      and s.manager_id is null
      and s.team_lead = leader.id::text
    order by s.created_at asc
    limit 100;
end
$$;

create or replace function public.team_leader_add_staff(_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  team public.teams%rowtype;
begin
  select * into team
  from public.teams
  where team_leader_id = actor and is_active
  for update;
  if actor is null or not found then
    raise exception 'Active team leader access required';
  end if;

  update public.staff
    set status = 'pending', role = 'Staff', manager_id = team.manager_id,
        team_leader_id = team.team_leader_id, team_id = team.id,
        team_lead = team.team_leader_id::text, updated_at = now()
    where id = _staff_id
      and status = 'pending'
      and manager_id is null
      and team_leader_id is null
      and team_lead = team.team_leader_id::text;
  if not found then
    raise exception 'Pending unassigned staff application not found';
  end if;

  insert into public.staff_activity_log (staff_id, action, metadata)
    values (_staff_id, 'team_leader_assigned',
            jsonb_build_object('team_leader_id', actor));
  return _staff_id;
end
$$;

revoke all on function public.can_review_staff_activity(uuid) from public, anon;
grant execute on function public.can_review_staff_activity(uuid) to authenticated;

revoke all on function public.team_leader_pending_staff() from public, anon;
grant execute on function public.team_leader_pending_staff() to authenticated, service_role;

revoke all on function public.team_leader_add_staff(uuid) from public, anon;
grant execute on function public.team_leader_add_staff(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
