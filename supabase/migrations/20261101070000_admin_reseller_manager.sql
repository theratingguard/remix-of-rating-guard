begin;

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
        select count(*)
        from public.teams team
        where team.reseller_id = reseller.user_id
          and team.is_active
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

revoke all on function public.admin_reseller_work_summary() from public, anon;
grant execute on function public.admin_reseller_work_summary() to authenticated;

notify pgrst, 'reload schema';
commit;
