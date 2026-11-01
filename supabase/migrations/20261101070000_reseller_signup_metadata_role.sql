create or replace function public.ensure_reseller_profile()
returns setof public.reseller_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
begin
  if auth.uid() is null or (
    coalesce(claims->'app_metadata'->>'role', '') <> 'reseller'
    and coalesce(claims->'user_metadata'->>'account_type', '') <> 'reseller'
    and public.report_access_level() <> 'super_admin'
  ) then
    raise exception 'Reseller access required';
  end if;

  insert into public.reseller_profiles (user_id)
    values (auth.uid())
    on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
    values (auth.uid(), 'reseller')
    on conflict (user_id, role) do nothing;

  return query
    select *
    from public.reseller_profiles
    where user_id = auth.uid();
end
$$;

revoke all on function public.ensure_reseller_profile() from public, anon;
grant execute on function public.ensure_reseller_profile() to authenticated, service_role;
