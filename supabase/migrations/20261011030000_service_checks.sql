begin;
create table public.service_checks (
  service text primary key check(service in ('google')),
  success boolean not null,
  detail text not null check(length(detail)<=1000),
  checked_at timestamptz not null default now()
);
alter table public.service_checks enable row level security;
revoke all on public.service_checks from anon,authenticated;
grant select,insert,update on public.service_checks to authenticated;
grant all on public.service_checks to service_role;
create policy super_admin_service_checks on public.service_checks for all to authenticated
 using(public.report_access_level()='super_admin') with check(public.report_access_level()='super_admin');
notify pgrst,'reload schema';
commit;
