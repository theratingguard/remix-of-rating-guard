begin;
alter table public.scan_batches add column if not exists control_status text not null default 'running'
  check (control_status in ('running','paused','cancelled'));
alter table public.system_state add column if not exists next_bulk_start_at timestamptz;

create or replace function public.claim_scan_jobs(_limit integer) returns setof public.scan_jobs
language plpgsql security definer set search_path = ''
as $$
declare job_id uuid;
begin
  perform 1 from public.system_state
    where id='main' and not queue_paused
      and (next_bulk_start_at is null or next_bulk_start_at<=clock_timestamp())
    for update;
  if not found then return; end if;
  select j.id into job_id from public.scan_jobs j
    join public.scan_batches b on b.id=j.batch_id
    where b.control_status='running' and
      ((j.status='pending' and j.next_run_at<=clock_timestamp()) or
       (j.status='processing' and j.locked_until<clock_timestamp()))
    order by j.created_at,j.position for update of j skip locked limit 1;
  if job_id is null then return; end if;
  update public.system_state set next_bulk_start_at=clock_timestamp()+interval '6 seconds'
    where id='main';
  return query update public.scan_jobs set status='processing',attempts=attempts+1,
    locked_until=clock_timestamp()+interval '10 minutes',updated_at=clock_timestamp()
    where id=job_id returning *;
end;
$$;
revoke all on function public.claim_scan_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_scan_jobs(integer) to service_role;
notify pgrst,'reload schema';
commit;
