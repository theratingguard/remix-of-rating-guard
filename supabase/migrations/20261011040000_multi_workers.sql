begin;
create table public.worker_tasks (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id),
  user_id uuid not null references auth.users(id),
  batch_id uuid references public.scan_batches(id),
  bulk_job_id uuid unique references public.scan_jobs(id),
  stage text not null check(stage in ('scanner','analyzer','legal','done')),
  status text not null default 'queued' check(status in ('queued','processing','complete','failed','cancelled')),
  generation integer not null default 0,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.worker_tasks(status,updated_at);
create table public.worker_logs (
  id uuid primary key default gen_random_uuid(), worker_name text not null,
  queue_name text not null, job_id text, status text not null,
  duration_ms integer check(duration_ms>=0), error text, payload jsonb,
  created_at timestamptz not null default now()
);
create index idx_worker_logs_worker on public.worker_logs(worker_name);
create index idx_worker_logs_created on public.worker_logs(created_at desc);
create table public.ai_daily_budget (
  day date primary key, reserved_usd numeric(12,6) not null default 0
    check(reserved_usd between 0 and 10), calls integer not null default 0
);
alter table public.worker_tasks enable row level security;
alter table public.worker_logs enable row level security;
alter table public.ai_daily_budget enable row level security;
revoke all on public.worker_tasks,public.worker_logs,public.ai_daily_budget from public,anon,authenticated;
grant all on public.worker_tasks,public.worker_logs,public.ai_daily_budget to service_role;
grant select on public.worker_tasks,public.worker_logs,public.ai_daily_budget to authenticated;
create policy super_admin_worker_tasks on public.worker_tasks for select to authenticated
  using(public.report_access_level()='super_admin');
create policy "Super admin read worker logs" on public.worker_logs for select to authenticated
  using(public.report_access_level()='super_admin');
create policy super_admin_ai_budget on public.ai_daily_budget for select to authenticated
  using(public.report_access_level()='super_admin');

create function public.reserve_ai_budget(_cost numeric) returns boolean
language plpgsql security definer set search_path='' as $$
declare today date := (clock_timestamp() at time zone 'UTC')::date;
begin
  if _cost is null or _cost<=0 or _cost>10 then raise exception 'Invalid AI budget reservation'; end if;
  insert into public.ai_daily_budget(day) values(today) on conflict do nothing;
  update public.ai_daily_budget set reserved_usd=reserved_usd+_cost,calls=calls+1
    where day=today and reserved_usd+_cost<=10;
  return found;
end $$;
revoke all on function public.reserve_ai_budget(numeric) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(numeric) to service_role;

create function public.enqueue_worker_scan(_url text) returns uuid
language plpgsql security definer set search_path='' as $$
declare scan uuid;
begin
  if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
  if _url is null or length(_url)>2000 or _url not like 'https://%' then raise exception 'Invalid Google URL'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ratingguard-admission-'||auth.uid()::text));
  select s.id into scan from public.scans s join public.worker_tasks t on t.scan_id=s.id
    where s.user_id=auth.uid() and s.source_url=_url and t.status in ('queued','processing') limit 1;
  if scan is not null then return scan; end if;
  perform public.reserve_scan_admission('single',1);
  insert into public.scans(user_id,source_url,status,stage,data_source)
    values(auth.uid(),_url,'running','queued','google_places') returning id into scan;
  insert into public.worker_tasks(scan_id,user_id,stage) values(scan,auth.uid(),'scanner');
  return scan;
end $$;
revoke all on function public.enqueue_worker_scan(text) from public,anon;
grant execute on function public.enqueue_worker_scan(text) to authenticated;

create function public.ensure_bulk_worker_task(_job_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare job public.scan_jobs; task uuid; scan uuid;
begin
  select * into job from public.scan_jobs where id=_job_id for update;
  if job.id is null then raise exception 'Bulk job not found'; end if;
  select id into task from public.worker_tasks where bulk_job_id=job.id;
  if task is not null then return task; end if;
  scan:=job.scan_id;
  if scan is null then
    insert into public.scans(user_id,batch_id,source_url,status,stage,data_source)
      values(job.user_id,job.batch_id,job.url,'running','queued','google_places') returning id into scan;
    update public.scan_jobs set scan_id=scan where id=job.id;
  end if;
  insert into public.worker_tasks(scan_id,user_id,batch_id,bulk_job_id,stage)
    values(scan,job.user_id,job.batch_id,job.id,'scanner') returning id into task;
  return task;
end $$;
revoke all on function public.ensure_bulk_worker_task(uuid) from public,anon,authenticated;
grant execute on function public.ensure_bulk_worker_task(uuid) to service_role;

create function public.worker_daily_stats() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'total',count(*),'failed',count(*) filter(where status='failed'),
 'completed',count(*) filter(where status='complete'),
 'average_ms',(select round(avg(duration_ms)) from public.worker_logs
   where status='complete' and created_at>=(now() at time zone 'UTC')::date),
 'reserved_usd',(select reserved_usd from public.ai_daily_budget where day=(now() at time zone 'UTC')::date))
 from public.worker_tasks where created_at>=(now() at time zone 'UTC')::date;
$$;
revoke all on function public.worker_daily_stats() from public,anon,authenticated;
grant execute on function public.worker_daily_stats() to service_role;
notify pgrst,'reload schema';
commit;
