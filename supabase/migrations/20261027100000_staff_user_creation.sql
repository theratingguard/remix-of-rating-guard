begin;

alter table public.staff
  add column mobile_number text,
  add column photo_url text,
  add column team_id uuid references public.teams(id) on delete set null;

update public.staff
set mobile_number = mobile
where mobile_number is null;

update public.staff s
set team_id = t.id
from public.teams t
where t.team_leader_id = s.team_leader_id
  and s.team_id is null;

alter table public.staff
  alter column mobile_number set not null,
  add constraint staff_mobile_number_length_check
    check (length(trim(mobile_number)) between 6 and 32);

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
end;
$$;

create trigger sync_staff_mobile_number
  before insert or update of mobile, mobile_number on public.staff
  for each row execute function public.sync_staff_mobile_number();

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
    set status = 'pending', role = 'Staff', manager_id = team.manager_id,
        team_leader_id = team.team_leader_id, team_id = team.id,
        team_lead = team.team_leader_id::text, updated_at = now()
    where id = _staff_id and status = 'pending'
      and manager_id is null and team_leader_id is null
      and team_lead in (
        team.team_leader_id::text,
        (select leader.name from public.staff leader where leader.id = team.team_leader_id)
      );
  if not found then raise exception 'Pending unassigned staff application not found'; end if;
  insert into public.staff_activity_log (staff_id, action, metadata)
    values (_staff_id, 'team_leader_assigned', jsonb_build_object('team_leader_id', actor));
  return _staff_id;
end
$$;

notify pgrst, 'reload schema';
commit;
