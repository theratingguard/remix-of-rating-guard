begin;

alter table public.reseller_profiles
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reseller_profiles'::regclass
      and conname = 'reseller_profiles_status_check'
  ) then
    alter table public.reseller_profiles
      add constraint reseller_profiles_status_check
      check (status in ('pending', 'approved', 'rejected', 'suspended'));
  end if;
end
$$;

create index if not exists reseller_profiles_status_created_idx
  on public.reseller_profiles (status, created_at desc);

create or replace function public.admin_reseller_work_summary()
returns table(
  reseller_id uuid,
  account_name text,
  account_email text,
  status text,
  clients_added bigint,
  team_leaders bigint,
  tasks_assigned bigint,
  commissions_earned_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;

  return query
    select
      reseller.user_id,
      coalesce(
        nullif(profile.name, ''),
        nullif(auth_user.raw_user_meta_data->>'name', ''),
        'Reseller'
      ),
      coalesce(auth_user.email, ''),
      reseller.status,
      (
        select count(*)
        from public.reseller_businesses business
        where business.reseller_id = reseller.user_id
      ),
      (
        select count(distinct leader.id)
        from public.teams team
        join public.staff leader on leader.id = team.team_leader_id
        where team.reseller_id = reseller.user_id
          and public.normalize_hierarchy_role(leader.role) = 'team_leader'
      ),
      (
        select count(*)
        from public.tasks task
        join public.teams team on team.id = task.team_id
        where team.reseller_id = reseller.user_id
      ),
      coalesce((
        select sum(commission.amount_cents)
        from public.reseller_commissions commission
        where commission.reseller_id = reseller.user_id
          and commission.review_removal_order_id is not null
          and commission.status <> 'rejected'
      ), 0)
    from public.reseller_profiles reseller
    join auth.users auth_user on auth_user.id = reseller.user_id
    left join public.profiles profile on profile.user_id = reseller.user_id
    order by reseller.created_at desc;
end
$$;

create or replace function public.admin_reseller_details(_reseller_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if not exists (
    select 1 from public.reseller_profiles where user_id = _reseller_id
  ) then
    raise exception 'Reseller profile not found';
  end if;

  return jsonb_build_object(
    'clients', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'business_id', business.id,
          'business_name', business.name,
          'owner_name', link.owner_name,
          'owner_email', link.owner_email,
          'owner_mobile', link.owner_mobile,
          'team_leader_name', leader.name,
          'created_at', link.created_at
        ) order by link.created_at desc
      )
      from public.reseller_businesses link
      join public.businesses business on business.id = link.business_id
      left join public.staff leader on leader.id = link.team_leader_id
      where link.reseller_id = _reseller_id
    ), '[]'::jsonb),
    'team_leaders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', leader.id,
          'name', leader.name,
          'email', leader.email,
          'unique_id', leader.unique_id,
          'status', leader.status,
          'team_id', team.id,
          'is_active', team.is_active
        ) order by team.created_at desc
      )
      from public.teams team
      join public.staff leader on leader.id = team.team_leader_id
      where team.reseller_id = _reseller_id
    ), '[]'::jsonb),
    'team_members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', member.id,
          'name', member.name,
          'email', member.email,
          'unique_id', member.unique_id,
          'status', member.status,
          'team_id', member.team_id,
          'team_leader_name', leader.name
        ) order by member.created_at desc
      )
      from public.teams team
      join public.staff leader on leader.id = team.team_leader_id
      join public.staff member on member.team_id = team.id
        and member.id <> leader.id
      where team.reseller_id = _reseller_id
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.admin_change_reseller_plan(
  _reseller_id uuid,
  _plan_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  reseller_status text;
  selected_plan public.reseller_plans%rowtype;
  membership public.reseller_memberships%rowtype;
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;

  select status into reseller_status
  from public.reseller_profiles
  where user_id = _reseller_id
  for update;
  if not found then raise exception 'Reseller profile not found'; end if;
  if reseller_status = 'suspended' or reseller_status = 'rejected' then
    raise exception 'Activate the reseller account before changing its plan';
  end if;

  select * into selected_plan
  from public.reseller_plans
  where id = _plan_id and is_active;
  if not found then raise exception 'Active reseller plan not found'; end if;

  select * into membership
  from public.reseller_memberships
  where reseller_id = _reseller_id
    and status in ('active', 'pending_payment')
  order by (status = 'active') desc, created_at desc
  limit 1
  for update;

  if found then
    update public.reseller_memberships
    set plan_id = selected_plan.id,
        annual_fee_cents = selected_plan.annual_fee_cents,
        commission_bps = selected_plan.commission_bps,
        updated_at = now()
    where id = membership.id;
  else
    insert into public.reseller_memberships (
      reseller_id, plan_id, annual_fee_cents, commission_bps
    ) values (
      _reseller_id, selected_plan.id, selected_plan.annual_fee_cents,
      selected_plan.commission_bps
    )
    returning * into membership;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    actor,
    'reseller_plan_changed',
    'reseller_membership',
    membership.id,
    jsonb_build_object(
      'reseller_id', _reseller_id,
      'plan_id', selected_plan.id,
      'annual_fee_cents', selected_plan.annual_fee_cents,
      'commission_bps', selected_plan.commission_bps
    )
  );
  return membership.id;
end
$$;

create or replace function public.admin_release_reseller_payout(
  _payout_id uuid,
  _payment_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  payout public.payout_requests%rowtype;
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if length(trim(coalesce(_payment_reference, ''))) < 8 then
    raise exception 'A confirmed payout reference is required';
  end if;

  select * into payout
  from public.payout_requests
  where id = _payout_id
  for update;
  if not found or payout.status not in ('requested', 'approved') then
    raise exception 'Payout request is not awaiting release';
  end if;

  update public.payout_requests
  set status = 'paid',
      reviewed_by = actor,
      reviewed_at = now(),
      paid_at = now(),
      payment_reference = trim(_payment_reference),
      updated_at = now()
  where id = _payout_id;

  update public.reseller_commissions
  set status = 'paid', payout_request_id = null, updated_at = now()
  where payout_request_id = _payout_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (
    actor,
    'payout_paid',
    'payout_request',
    _payout_id,
    jsonb_build_object('payment_reference', trim(_payment_reference))
  );
  return _payout_id;
end
$$;

revoke all on function public.admin_reseller_work_summary() from public, anon;
revoke all on function public.admin_reseller_details(uuid) from public, anon;
revoke all on function public.admin_change_reseller_plan(uuid, text) from public, anon;
revoke all on function public.admin_release_reseller_payout(uuid, text) from public, anon;
grant execute on function public.admin_reseller_work_summary() to authenticated;
grant execute on function public.admin_reseller_details(uuid) to authenticated;
grant execute on function public.admin_change_reseller_plan(uuid, text) to authenticated;
grant execute on function public.admin_release_reseller_payout(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
