begin;

create or replace function public.can_read_report_owner(owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.report_access_level() = 'super_admin'
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'client'
      and owner_id = auth.uid()
    )
  )
$$;

create or replace function public.reserve_scan_admission(_kind text, _quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  cap integer;
  is_client boolean := auth.jwt() -> 'app_metadata' ->> 'role' = 'client';
begin
  if public.report_access_level() <> 'super_admin'
    and not (is_client and _kind = 'single' and _quantity = 1) then
    raise exception 'Access Denied';
  end if;
  if _kind is null or _quantity is null or _kind not in ('single', 'bulk')
    or _quantity < 1 or (_kind = 'single' and _quantity <> 1) then
    raise exception 'Invalid scan admission';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('ratingguard-admission-' || auth.uid()::text)
  );
  if _kind = 'bulk' then
    if public.setting_value('bulk_scan_enabled') <> 'true'::jsonb then
      raise exception 'Bulk Scan disabled in Settings';
    end if;
    cap = (public.setting_value('bulk_daily_limit')::text)::integer;
    select coalesce(sum(quantity), 0) into used
      from public.scan_admissions
      where user_id = auth.uid()
        and kind = 'bulk'
        and created_at >= date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  else
    cap = (public.setting_value('single_hourly_limit')::text)::integer;
    select coalesce(sum(quantity), 0) into used
      from public.scan_admissions
      where user_id = auth.uid()
        and kind = 'single'
        and created_at > clock_timestamp() - interval '1 hour';
    perform 1 from public.system_state where id = 'main' for update;
    if not found then raise exception 'Scan rate state unavailable'; end if;
    if (
      select count(*) from public.scan_start_slots
      where created_at > clock_timestamp() - interval '1 minute'
    ) >= (public.setting_value('rate_limit_per_min')::text)::integer then
      raise exception 'Shared scan per-minute rate limit reached';
    end if;
  end if;
  if used + _quantity > cap then
    raise exception '% scan limit reached (% used, cap %)', _kind, used, cap;
  end if;
  insert into public.scan_admissions(user_id, kind, quantity)
    values (auth.uid(), _kind, _quantity);
  if _kind = 'single' then insert into public.scan_start_slots default values; end if;
end
$$;

create or replace function public.enqueue_worker_scan(_url text, _region text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  scan uuid;
  is_client boolean := auth.jwt() -> 'app_metadata' ->> 'role' = 'client';
begin
  if public.report_access_level() <> 'super_admin' and not is_client then
    raise exception 'Access Denied';
  end if;
  if _url is null or length(_url) > 2000
    or _url !~* '^https://(maps\.app\.goo\.gl|goo\.gl|g\.page|([a-z0-9-]+\.)?google\.[a-z]{2,}(\.[a-z]{2,})?)(/|[?#])' then
    raise exception 'Invalid Google URL';
  end if;
  if _region is not null and _region not in
    ('US','UK','IN','DE','FR','IT','ES','NL','CA','AU','JP','SG','PH','AE','KE','RW','ZA','NG','BR','MX','EU','AF','OTHER') then
    raise exception 'Invalid region override';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('ratingguard-admission-' || auth.uid()::text)
  );
  select s.id into scan
    from public.scans s
    join public.worker_tasks t on t.scan_id = s.id
    where s.user_id = auth.uid()
      and s.source_url = _url
      and t.status in ('queued', 'processing')
    limit 1;
  if scan is not null then
    update public.scans set region = coalesce(_region, region) where id = scan;
    return scan;
  end if;
  perform public.reserve_scan_admission('single', 1);
  insert into public.scans(user_id, source_url, status, stage, data_source, region, region_source)
    values (
      auth.uid(), _url, 'running', 'queued', 'google_places', _region,
      case when _region is null then null else 'manual' end
    )
    returning id into scan;
  insert into public.worker_tasks(scan_id, user_id, stage)
    values (scan, auth.uid(), 'scanner');
  return scan;
end
$$;

create policy client_valid_action_insert
  on public.review_actions as restrictive
  for insert to authenticated
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client'
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.scans s
        where s.id = scan_id and s.user_id = auth.uid() and not s.is_seed
      )
      and exists (
        select 1 from public.reviews r
        where r.id = review_id and r.scan_id = scan_id
          and r.risk in ('high', 'medium')
          and status = 'PENDING'
          and r.rating in (1, 2)
          and r.review_uri is not null
      )
    )
  );

create policy client_readonly_scans_insert
  on public.scans as restrictive
  for insert to authenticated
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_readonly_scans_update
  on public.scans as restrictive
  for update to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_readonly_reports_insert
  on public.reports as restrictive
  for insert to authenticated
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_readonly_reports_update
  on public.reports as restrictive
  for update to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_readonly_reviews_insert
  on public.reviews as restrictive
  for insert to authenticated
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_readonly_reviews_update
  on public.reviews as restrictive
  for update to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_readonly_analyses_insert
  on public.review_analyses as restrictive
  for insert to authenticated
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_readonly_analyses_update
  on public.review_analyses as restrictive
  for update to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');

create policy client_pending_action_update
  on public.review_actions as restrictive
  for update to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client'
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.scans s
        where s.id = scan_id and s.user_id = auth.uid() and not s.is_seed
      )
      and exists (
        select 1 from public.reviews r
        where r.id = review_id and r.scan_id = scan_id
          and r.risk in ('high', 'medium')
          and r.rating in (1, 2)
          and r.review_uri is not null
      )
    )
  )
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client'
    or (
      user_id = auth.uid()
      and status = 'PENDING'
      and exists (
        select 1 from public.scans s
        where s.id = scan_id and s.user_id = auth.uid() and not s.is_seed
      )
      and exists (
        select 1 from public.reviews r
        where r.id = review_id and r.scan_id = scan_id
          and r.risk in ('high', 'medium')
          and r.rating in (1, 2)
          and r.review_uri is not null
      )
    )
  );

create policy client_hide_scan_events
  on public.scan_events as restrictive
  for select to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_hide_scan_jobs
  on public.scan_jobs as restrictive
  for select to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_hide_error_events
  on public.error_events as restrictive
  for select to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');
create policy client_hide_audit_log
  on public.audit_log as restrictive
  for select to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client');

create index if not exists reviews_scan_rating_client_idx
  on public.reviews (scan_id, rating);
create index if not exists review_actions_user_status_client_idx
  on public.review_actions (user_id, status, updated_at desc);

create or replace function public.client_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
    or auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client' then
    raise exception 'Access Denied';
  end if;

  select jsonb_build_object(
    'totalReviewsScanned',
      coalesce((select sum(s.reviews_retrieved) from public.scans s
        where s.user_id = auth.uid() and not s.is_seed), 0),
    'badReviewsDetected',
      (select count(*) from public.reviews r
        join public.scans s on s.id = r.scan_id
        where s.user_id = auth.uid() and not s.is_seed and r.rating in (1, 2)),
    'reportsSubmitted',
      (select count(*) from public.removal_outcomes o
        join public.scans s on s.id = o.scan_id
        where o.user_id = auth.uid() and s.user_id = auth.uid() and not s.is_seed),
    'successfulRemovals',
      (select count(*) from public.removal_outcomes o
        join public.scans s on s.id = o.scan_id
        where o.user_id = auth.uid() and s.user_id = auth.uid()
          and not s.is_seed and o.outcome = 'approved'),
    'recentActivity',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'businessName', recent.business_name,
          'createdAt', recent.created_at,
          'action', recent.action,
          'status', recent.activity_status
        ) order by recent.created_at desc)
        from (
          select
            s.id,
            s.business_name,
            s.created_at,
            case
              when exists (
                select 1 from public.removal_outcomes o
                where o.scan_id = s.id and o.user_id = auth.uid()
                  and o.outcome = 'approved'
              ) then 'Removed'
              when exists (
                select 1 from public.review_actions a
                where a.scan_id = s.id and a.user_id = auth.uid()
                  and a.status in ('REPORTED', 'SUBMITTED', 'REMOVED')
              ) or exists (
                select 1 from public.removal_outcomes o
                where o.scan_id = s.id and o.user_id = auth.uid()
              ) then 'Reported'
              when exists (
                select 1 from public.review_actions a
                where a.scan_id = s.id and a.user_id = auth.uid() and a.status = 'PENDING'
              ) then 'Report prepared'
              else 'Scanned'
            end as action,
            case
              when exists (
                select 1 from public.review_actions a
                where a.scan_id = s.id and a.user_id = auth.uid() and a.status = 'REMOVED'
              ) or exists (
                select 1 from public.removal_outcomes o
                where o.scan_id = s.id and o.user_id = auth.uid() and o.outcome = 'approved'
              ) then 'Removed'
              when exists (
                select 1 from public.removal_outcomes o
                where o.scan_id = s.id and o.user_id = auth.uid() and o.outcome = 'rejected'
              ) then 'Rejected'
              when exists (
                select 1 from public.removal_outcomes o
                where o.scan_id = s.id and o.user_id = auth.uid() and o.outcome = 'pending'
              ) then 'Pending'
              when exists (
                select 1 from public.review_actions a
                where a.scan_id = s.id and a.user_id = auth.uid() and a.status = 'PENDING'
              ) then 'Report draft pending'
              when s.status = 'complete' then 'Complete'
              when s.status = 'failed' then 'Could not complete'
              else 'In progress'
            end as activity_status
          from public.scans s
          where s.user_id = auth.uid() and not s.is_seed
          order by s.created_at desc
          limit 10
        ) recent
      ), '[]'::jsonb)
  ) into result;

  return result;
end
$$;

revoke all on function public.client_dashboard_summary() from public, anon;
grant execute on function public.client_dashboard_summary() to authenticated;

create or replace function public.client_report_page(
  _search text default null,
  _limit integer default 50,
  _offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
    or auth.jwt() -> 'app_metadata' ->> 'role' is distinct from 'client' then
    raise exception 'Access Denied';
  end if;
  if _limit is null or _limit < 1 or _limit > 100
    or _offset is null or _offset < 0 or _offset > 1000000
    or length(coalesce(_search, '')) > 120 then
    raise exception 'Invalid report page';
  end if;

  with matching as (
    select
      r.id,
      r.scan_id,
      r.report_number,
      r.created_at,
      r.report_data,
      coalesce(s.business_name, 'Business') as business_name,
      case
        when exists (
          select 1 from public.removal_outcomes o
          where o.scan_id = r.scan_id and o.user_id = auth.uid() and o.outcome = 'approved'
        ) then 'Removed'
        when exists (
          select 1 from public.removal_outcomes o
          where o.scan_id = r.scan_id and o.user_id = auth.uid() and o.outcome = 'rejected'
        ) then 'Rejected'
        when exists (
          select 1 from public.removal_outcomes o
          where o.scan_id = r.scan_id and o.user_id = auth.uid() and o.outcome = 'pending'
        ) or exists (
          select 1 from public.review_actions a
          where a.scan_id = r.scan_id and a.user_id = auth.uid() and a.status = 'PENDING'
        ) then 'Pending'
        when exists (
          select 1 from public.review_actions a
          where a.scan_id = r.scan_id and a.user_id = auth.uid()
            and a.status in ('REPORTED', 'SUBMITTED')
        ) then 'Reported'
        else 'Draft ready'
      end as status
    from public.reports r
    join public.scans s on s.id = r.scan_id
    where r.user_id = auth.uid()
      and not r.is_seed
      and s.user_id = auth.uid()
      and not s.is_seed
      and (
        nullif(trim(coalesce(_search, '')), '') is null
        or s.business_name ilike '%' || trim(_search) || '%'
      )
  ),
  page as (
    select * from matching
    order by created_at desc, id
    limit _limit offset _offset
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'scanId', p.scan_id,
        'reportNumber', p.report_number,
        'createdAt', p.created_at,
        'businessName', p.business_name,
        'status', p.status,
        'reportData', p.report_data
      ) order by p.created_at desc, p.id)
      from page p
    ), '[]'::jsonb)
  ) into result;

  return result;
end
$$;

revoke all on function public.client_report_page(text, integer, integer) from public, anon;
grant execute on function public.client_report_page(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
