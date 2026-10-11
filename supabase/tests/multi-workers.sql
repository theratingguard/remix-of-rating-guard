begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',
 (select id from auth.users where email='theratingguard@gmail.com'),'email',
 'theratingguard@gmail.com','role','authenticated')::text,true);
set local role authenticated;
do $$
declare first_id uuid; second_id uuid;
begin
 first_id:=public.enqueue_worker_scan('https://www.google.com/maps?query_place_id=unit-worker-fixture');
 second_id:=public.enqueue_worker_scan('https://www.google.com/maps?query_place_id=unit-worker-fixture');
 if first_id<>second_id then raise exception 'Duplicate active submission was not idempotent'; end if;
 if not exists(select 1 from public.worker_tasks where scan_id=first_id and stage='scanner' and status='queued')
 then raise exception 'Transactional outbox admission missing'; end if;
end $$;
reset role;
set local role service_role;
do $$
begin
 if not public.reserve_ai_budget(9) then raise exception 'Initial budget reservation failed'; end if;
 if public.reserve_ai_budget(2) then raise exception 'Daily budget overspend permitted'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated","email":"fixture@example.invalid"}',true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.worker_tasks) or exists(select 1 from public.worker_logs)
 then raise exception 'Worker diagnostics leaked to ordinary account'; end if;
 begin
  perform public.enqueue_worker_scan('https://www.google.com/maps?cid=fixture');
  raise exception 'Ordinary account queued privileged scan';
 exception when raise_exception then
  if sqlerrm<>'Access Denied' then raise; end if;
 end;
 begin
  perform public.reserve_ai_budget(0.1);
  raise exception 'Ordinary account reserved AI budget';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform 1 from public.worker_logs;
  raise exception 'Anonymous worker diagnostics allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
