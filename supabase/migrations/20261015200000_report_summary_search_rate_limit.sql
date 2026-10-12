begin;

create or replace function public.private_report_summaries()
returns table(scan_id uuid, business_name text, total_reviews integer)
language sql stable security definer set search_path = '' as $$
  select s.id, s.business_name, s.total_reviews
  from public.scans s
  where auth.uid() is not null
    and (
      s.user_id = auth.uid()
      or public.report_access_level() = 'super_admin'
    )
  order by s.created_at desc
$$;

create table public.business_search_admissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table public.business_search_admissions enable row level security;
revoke all on public.business_search_admissions from public, anon, authenticated;
grant all on public.business_search_admissions to service_role;

create or replace function public.reserve_business_search()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  reserved_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if caller_id is null then
    raise exception 'Unauthorized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ratingguard-business-search:' || caller_id::text, 0)
  );

  insert into public.business_search_admissions as admission
    (user_id, window_started_at, request_count)
  values (caller_id, v_now, 1)
  on conflict (user_id) do update
    set window_started_at = case
          when admission.window_started_at <= v_now - interval '1 hour'
            then v_now
          else admission.window_started_at
        end,
        request_count = case
          when admission.window_started_at <= v_now - interval '1 hour'
            then 1
          else admission.request_count + 1
        end
  returning request_count into reserved_count;

  if reserved_count > 30 then
    raise exception 'Business search rate limit exceeded';
  end if;
end
$$;

revoke all on function public.reserve_business_search() from public, anon;
grant execute on function public.reserve_business_search() to authenticated;

notify pgrst, 'reload schema';
commit;
