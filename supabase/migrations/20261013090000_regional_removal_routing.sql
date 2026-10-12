begin;

alter table public.scans
  add column if not exists region text
    check (region in ('US','UK','IN','DE','FR','IT','ES','NL','CA','AU','JP','SG','PH','AE','KE','RW','ZA','NG','BR','MX','EU','AF','OTHER')),
  add column if not exists removal_method text
    check (removal_method is null or removal_method = 'google-policy-review'),
  add column if not exists region_source text
    check (region_source is null or region_source in ('google_places','address','manual','unresolved'));

drop function if exists public.enqueue_worker_scan(text);
create function public.enqueue_worker_scan(_url text, _region text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare scan uuid;
begin
  if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
  if _url is null or length(_url)>2000 or _url not like 'https://%' then raise exception 'Invalid Google URL'; end if;
  if _region is not null and _region not in
    ('US','UK','IN','DE','FR','IT','ES','NL','CA','AU','JP','SG','PH','AE','KE','RW','ZA','NG','BR','MX','EU','AF','OTHER') then
    raise exception 'Invalid region override';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ratingguard-admission-'||auth.uid()::text));
  select s.id into scan from public.scans s join public.worker_tasks t on t.scan_id=s.id
    where s.user_id=auth.uid() and s.source_url=_url and t.status in ('queued','processing') limit 1;
  if scan is not null then
    update public.scans set region=coalesce(_region,region) where id=scan;
    return scan;
  end if;
  perform public.reserve_scan_admission('single',1);
  insert into public.scans(user_id,source_url,status,stage,data_source,region,region_source)
    values(auth.uid(),_url,'running','queued','google_places',_region,
      case when _region is null then null else 'manual' end) returning id into scan;
  insert into public.worker_tasks(scan_id,user_id,stage) values(scan,auth.uid(),'scanner');
  return scan;
end $$;
revoke all on function public.enqueue_worker_scan(text,text) from public,anon;
grant execute on function public.enqueue_worker_scan(text,text) to authenticated;

create or replace function public.regional_removal_stats() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'region', coalesce(stats.region, 'OTHER'),
    'jurisdiction', coalesce(stats.region, 'OTHER'),
    'scans', stats.scans,
    'submissions', stats.submissions,
    'pending', stats.pending,
    'approved', stats.approved,
    'rejected', stats.rejected,
    'resolved', stats.resolved,
    'success_rate', case when stats.resolved=0 then null
      else round(stats.approved::numeric * 100 / stats.resolved, 1) end
  ) order by coalesce(stats.region,'OTHER')), '[]'::jsonb)
  into result
  from (
    select s.region, count(distinct s.id)::integer as scans,
      count(o.id)::integer as submissions,
      count(o.id) filter (where o.outcome='pending')::integer as pending,
      count(o.id) filter (where o.outcome='approved')::integer as approved,
      count(o.id) filter (where o.outcome='rejected')::integer as rejected,
      count(o.id) filter (where o.outcome in ('approved','rejected'))::integer as resolved
    from public.scans s
    left join public.removal_outcomes o on o.scan_id=s.id
    where s.is_seed=false
    group by s.region
  ) stats;
  return result;
end $$;
revoke all on function public.regional_removal_stats() from public,anon;
grant execute on function public.regional_removal_stats() to authenticated;

notify pgrst, 'reload schema';
commit;
