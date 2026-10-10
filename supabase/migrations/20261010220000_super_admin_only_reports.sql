begin;

do $$
declare designated_user uuid;
begin
  select id into strict designated_user from auth.users
    where lower(email) = 'theratingguard@gmail.com';
  update public.report_principals set access_level = 'reseller'
    where access_level = 'super_admin' and user_id <> designated_user;
  insert into public.report_principals(user_id, access_level)
    values(designated_user, 'super_admin')
    on conflict(user_id) do update set access_level = 'super_admin';
end $$;

create unique index report_single_super_admin
  on public.report_principals(access_level) where access_level = 'super_admin';

create or replace function public.report_access_level() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'denied'
    when exists(
      select 1 from public.report_principals p join auth.users u on u.id = p.user_id
      where p.user_id = auth.uid() and p.access_level = 'super_admin'
        and lower(u.email) = 'theratingguard@gmail.com'
    ) then 'super_admin'
    else 'summary'
  end
$$;

create or replace function public.can_read_report_owner(owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.report_access_level() = 'super_admin'
$$;

create or replace function public.private_report_summaries()
returns table(scan_id uuid, business_name text, total_reviews integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.business_name, s.total_reviews from public.scans s
    where auth.uid() is not null order by s.created_at desc
$$;

revoke all on function public.report_access_level() from public, anon;
revoke all on function public.can_read_report_owner(uuid) from public, anon;
revoke all on function public.private_report_summaries() from public, anon;
grant execute on function public.report_access_level() to authenticated, service_role;
grant execute on function public.can_read_report_owner(uuid) to authenticated, service_role;
grant execute on function public.private_report_summaries() to authenticated;
notify pgrst, 'reload schema';
commit;
