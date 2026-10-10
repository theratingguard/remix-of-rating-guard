begin;
create table public.scan_start_slots (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default clock_timestamp()
);
create index on public.scan_start_slots(created_at);
alter table public.scan_start_slots enable row level security;
revoke all on public.scan_start_slots from public,anon,authenticated;
grant all on public.scan_start_slots to service_role;
create or replace function public.reserve_scan_admission(_kind text,_quantity integer) returns void
 language plpgsql security definer set search_path='' as $$
declare used integer; cap integer;
begin
 if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
 if _kind is null or _quantity is null or _kind not in ('single','bulk') or _quantity<1 or (_kind='single' and _quantity<>1) then raise exception 'Invalid scan admission'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ratingguard-admission-'||auth.uid()::text));
 if _kind='bulk' then
   if public.setting_value('bulk_scan_enabled')<>'true'::jsonb then raise exception 'Bulk Scan disabled in Settings'; end if;
   cap=(public.setting_value('bulk_daily_limit')::text)::integer;
   select coalesce(sum(quantity),0) into used from public.scan_admissions where user_id=auth.uid() and kind='bulk'
     and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 else
   cap=(public.setting_value('single_hourly_limit')::text)::integer;
   select coalesce(sum(quantity),0) into used from public.scan_admissions where user_id=auth.uid() and kind='single'
     and created_at>clock_timestamp()-interval '1 hour';
   perform 1 from public.system_state where id='main' for update;
   if not found then raise exception 'Scan rate state unavailable'; end if;
   if (select count(*) from public.scan_start_slots where created_at>clock_timestamp()-interval '1 minute')
     >= (public.setting_value('rate_limit_per_min')::text)::integer then raise exception 'Shared scan per-minute rate limit reached'; end if;
 end if;
 if used+_quantity>cap then raise exception '% scan limit reached (% used, cap %)',_kind,used,cap; end if;
 insert into public.scan_admissions(user_id,kind,quantity) values(auth.uid(),_kind,_quantity);
 if _kind='single' then insert into public.scan_start_slots default values; end if;
end $$;
create or replace function public.claim_scan_jobs(_limit integer) returns setof public.scan_jobs
language plpgsql security definer set search_path='' as $$
declare job_id uuid; per_min integer;
begin
 if public.setting_value('bulk_scan_enabled')<>'true'::jsonb then return; end if;
 per_min=(public.setting_value('rate_limit_per_min')::text)::integer;
 perform 1 from public.system_state where id='main' and not queue_paused
   and (next_bulk_start_at is null or next_bulk_start_at<=clock_timestamp()) for update;
 if not found then return; end if;
 if (select count(*) from public.scan_start_slots where created_at>clock_timestamp()-interval '1 minute')>=per_min then return; end if;
 select j.id into job_id from public.scan_jobs j join public.scan_batches b on b.id=j.batch_id
   where b.control_status='running' and ((j.status='pending' and j.next_run_at<=clock_timestamp())
   or (j.status='processing' and j.locked_until<clock_timestamp()))
   order by j.created_at,j.position for update of j skip locked limit 1;
 if job_id is null then return; end if;
 insert into public.scan_start_slots default values;
 update public.system_state set next_bulk_start_at=clock_timestamp()+make_interval(secs=>60.0/per_min) where id='main';
 return query update public.scan_jobs set status='processing',attempts=attempts+1,
   locked_until=clock_timestamp()+interval '10 minutes',updated_at=clock_timestamp()
   where id=job_id returning *;
end $$;
notify pgrst,'reload schema';
commit;
