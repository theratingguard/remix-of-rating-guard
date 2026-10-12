begin;

alter table public.scans drop constraint if exists scans_region_check;
alter table public.scans add constraint scans_region_check
  check (region is null or region in
    ('US','UK','IN','DE','FR','IT','ES','NL','CA','AU','JP','SG','PH','AE','KE','RW','ZA','NG','BR','MX','EU','AF','OTHER'));
alter table public.scans
  add column if not exists region_source text
    check (region_source is null or region_source in ('google_places','address','manual','unresolved'));
update public.scans
set region_source='unresolved'
where region is not null and region_source is null;

alter table public.removal_outcomes
  add column if not exists country text,
  add column if not exists method text,
  add column if not exists review_type text;

update public.removal_outcomes o
set country = coalesce(s.region, 'OTHER'),
    method = 'google-policy-review',
    review_type = o.policy_type
from public.scans s
where s.id = o.scan_id
  and (o.country is null or o.method is null or o.review_type is null);

alter table public.removal_outcomes
  alter column country set default 'OTHER',
  alter column country set not null,
  alter column method set default 'google-policy-review',
  alter column method set not null,
  alter column review_type set not null,
  add constraint removal_outcomes_country_check
    check (country in ('US','UK','IN','DE','FR','IT','ES','NL','CA','AU','JP','SG','PH','AE','KE','RW','ZA','NG','BR','MX','EU','AF','OTHER')),
  add constraint removal_outcomes_method_check
    check (method = 'google-policy-review');

create function public.stamp_legal_outcome_country() returns trigger
language plpgsql security definer set search_path='' as $$
declare scan_region text;
begin
  if tg_op='UPDATE' and new.country is distinct from old.country then
    raise exception 'Recorded submission country cannot be changed';
  end if;
  select s.region into scan_region from public.scans s where s.id=new.scan_id;
  new.country := coalesce(scan_region, 'OTHER');
  new.method := 'google-policy-review';
  new.review_type := new.policy_type;
  return new;
end $$;
create trigger stamp_legal_outcome_country
before insert or update of scan_id, policy_type, country, method, review_type
on public.removal_outcomes for each row
execute function public.stamp_legal_outcome_country();
revoke all on function public.stamp_legal_outcome_country() from public, anon, authenticated;

create table public.legal_country_workers (
  country text primary key check (country in
    ('US','UK','IN','DE','FR','IT','ES','NL','CA','AU','JP','SG','PH','AE','KE','RW','ZA','NG','BR','MX')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.legal_country_workers(country) values
  ('US'),('UK'),('IN'),('DE'),('FR'),('IT'),('ES'),('NL'),('CA'),('AU'),
  ('JP'),('SG'),('PH'),('AE'),('KE'),('RW'),('ZA'),('NG'),('BR'),('MX');

alter table public.legal_country_workers enable row level security;
revoke all on public.legal_country_workers from public, anon, authenticated;
grant all on public.legal_country_workers to service_role;

create function public.set_country_legal_worker(_country text, _enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
  if _country is null or _enabled is null then raise exception 'Country and enabled state are required'; end if;
  update public.legal_country_workers
    set enabled=_enabled, updated_at=now()
    where country=_country;
  if not found then raise exception 'Country has no registered legal worker'; end if;
  return true;
end $$;
revoke all on function public.set_country_legal_worker(text,boolean) from public, anon;
grant execute on function public.set_country_legal_worker(text,boolean) to authenticated;

create function public.country_legal_worker_enabled(_country text) returns boolean
language plpgsql security definer set search_path='' as $$
declare is_enabled boolean;
begin
  if public.report_access_level()<>'super_admin' then return false; end if;
  select enabled into is_enabled from public.legal_country_workers where country=_country;
  return coalesce(is_enabled,false);
end $$;
revoke all on function public.country_legal_worker_enabled(text) from public, anon;
grant execute on function public.country_legal_worker_enabled(text) to authenticated;

create function public.legal_worker_stats() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'country', w.country,
    'enabled', w.enabled,
    'cases', stats.cases,
    'submissions', stats.submissions,
    'pending', stats.pending,
    'approved', stats.approved,
    'rejected', stats.rejected,
    'resolved', stats.resolved,
    'success_rate', case when stats.resolved=0 then null
      else round(stats.approved::numeric * 100 / stats.resolved, 1) end,
    'average_days_to_response', stats.average_days_to_response
  ) order by w.country), '[]'::jsonb)
  into result
  from public.legal_country_workers w
  left join lateral (
    select
      count(distinct s.id)::integer as cases,
      count(o.id)::integer as submissions,
      count(o.id) filter (where o.outcome='pending')::integer as pending,
      count(o.id) filter (where o.outcome='approved')::integer as approved,
      count(o.id) filter (where o.outcome='rejected')::integer as rejected,
      count(o.id) filter (where o.outcome in ('approved','rejected'))::integer as resolved,
      round(
        (avg(extract(epoch from (o.response_at-o.submitted_at))/86400.0)
          filter (where o.response_at is not null))::numeric,
        1
      ) as average_days_to_response
    from public.scans s
    left join public.removal_outcomes o on o.scan_id=s.id and o.country=w.country
    where s.region=w.country and s.is_seed=false
  ) stats on true;
  return result;
end $$;
revoke all on function public.legal_worker_stats() from public, anon;
grant execute on function public.legal_worker_stats() to authenticated;

notify pgrst, 'reload schema';
commit;
