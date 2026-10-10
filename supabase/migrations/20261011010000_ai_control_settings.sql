begin;
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint valid_app_setting check (
    (key in ('gpt_enabled','claude_enabled','gemini_enabled','multi_model_enabled','bulk_scan_enabled',
      'legal_expert_enabled','auto_pdf_enabled','email_share_enabled','whatsapp_share_enabled','appeal_tracking_enabled')
      and jsonb_typeof(value)='boolean') or
    (key in ('bulk_daily_limit','single_hourly_limit','rate_limit_per_min','pdf_retention_days') and
      case when jsonb_typeof(value)='number' then (value::text)::numeric=trunc((value::text)::numeric) and
      (value::text)::numeric between 1 and
      case key when 'bulk_daily_limit' then 5000 when 'single_hourly_limit' then 1000
        when 'rate_limit_per_min' then 10 else 90 end else false end)
  )
);
insert into public.app_settings(key,value) values
 ('gpt_enabled','true'),('claude_enabled','true'),('gemini_enabled','true'),
 ('multi_model_enabled','true'),('bulk_scan_enabled','true'),('legal_expert_enabled','true'),
 ('auto_pdf_enabled','true'),('email_share_enabled','false'),('whatsapp_share_enabled','true'),
 ('appeal_tracking_enabled','true'),('bulk_daily_limit','500'),('single_hourly_limit','100'),
 ('rate_limit_per_min','10'),('pdf_retention_days','90');
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon,authenticated;
grant select,update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
create policy super_admin_manage_settings on public.app_settings for all to authenticated
 using(public.report_access_level()='super_admin') with check(public.report_access_level()='super_admin');
create function public.setting_value(name text) returns jsonb language sql stable security definer set search_path='' as $$
 select value from public.app_settings where key=name
$$;
revoke all on function public.setting_value(text) from public,anon,authenticated;
grant execute on function public.setting_value(text) to service_role;
create function public.update_app_settings(_settings jsonb) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
 if jsonb_typeof(_settings)<>'object' or (select count(*) from jsonb_object_keys(_settings))<>14
   or exists(select 1 from jsonb_object_keys(_settings) k where not exists(select 1 from public.app_settings s where s.key=k)) then
   raise exception 'Exactly all supported settings required'; end if;
 update public.app_settings s set value=_settings->s.key,updated_at=clock_timestamp()
 where s.key in (select jsonb_object_keys(_settings));
end $$;
revoke all on function public.update_app_settings(jsonb) from public,anon;
grant execute on function public.update_app_settings(jsonb) to authenticated;
create table public.scan_admissions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('single','bulk')), quantity integer not null,
 created_at timestamptz not null default clock_timestamp()
);
create index on public.scan_admissions(user_id,created_at);
alter table public.scan_admissions enable row level security;
revoke all on public.scan_admissions from anon,authenticated;
grant all on public.scan_admissions to service_role;
create function public.reserve_scan_admission(_kind text,_quantity integer) returns void
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
   if (select count(*) from public.scan_admissions where user_id=auth.uid() and kind='single'
       and created_at>clock_timestamp()-interval '1 minute') >= (public.setting_value('rate_limit_per_min')::text)::integer then
     raise exception 'Single scan per-minute rate limit reached'; end if;
 end if;
 if used+_quantity>cap then raise exception '% scan limit reached (% used, cap %)',_kind,used,cap; end if;
 insert into public.scan_admissions(user_id,kind,quantity) values(auth.uid(),_kind,_quantity);
end $$;
revoke all on function public.reserve_scan_admission(text,integer) from public,anon;
grant execute on function public.reserve_scan_admission(text,integer) to authenticated;
create or replace function public.claim_scan_jobs(_limit integer) returns setof public.scan_jobs
language plpgsql security definer set search_path='' as $$
declare job_id uuid; per_min integer;
begin
 if public.setting_value('bulk_scan_enabled')<>'true'::jsonb then return; end if;
 per_min=(public.setting_value('rate_limit_per_min')::text)::integer;
 perform 1 from public.system_state where id='main' and not queue_paused
   and (next_bulk_start_at is null or next_bulk_start_at<=clock_timestamp()) for update;
 if not found then return; end if;
 select j.id into job_id from public.scan_jobs j join public.scan_batches b on b.id=j.batch_id
   where b.control_status='running' and ((j.status='pending' and j.next_run_at<=clock_timestamp())
   or (j.status='processing' and j.locked_until<clock_timestamp()))
   order by j.created_at,j.position for update of j skip locked limit 1;
 if job_id is null then return; end if;
 update public.system_state set next_bulk_start_at=clock_timestamp()+make_interval(secs=>60.0/per_min) where id='main';
 return query update public.scan_jobs set status='processing',attempts=attempts+1,
   locked_until=clock_timestamp()+interval '10 minutes',updated_at=clock_timestamp()
   where id=job_id returning *;
end $$;
create table public.ai_model_status (
 model text primary key check(model in ('gpt','claude','gemini')),
 result jsonb not null,updated_at timestamptz not null default now()
);
alter table public.ai_model_status enable row level security;
revoke all on public.ai_model_status from anon,authenticated;
grant select,insert,update on public.ai_model_status to authenticated;
grant all on public.ai_model_status to service_role;
create policy super_admin_model_status on public.ai_model_status for all to authenticated
 using(public.report_access_level()='super_admin') with check(public.report_access_level()='super_admin');
create policy enabled_outcome_feature on public.removal_outcomes as restrictive for all to authenticated
 using((select value from public.app_settings where key='appeal_tracking_enabled')='true'::jsonb)
 with check((select value from public.app_settings where key='appeal_tracking_enabled')='true'::jsonb);
create policy enabled_appeal_feature on public.appeal_tracking as restrictive for all to authenticated
 using((select value from public.app_settings where key='appeal_tracking_enabled')='true'::jsonb)
 with check((select value from public.app_settings where key='appeal_tracking_enabled')='true'::jsonb);
notify pgrst,'reload schema';
commit;
