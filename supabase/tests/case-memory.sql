begin;
select set_config('request.jwt.claims',
  jsonb_build_object('sub',(select id from auth.users where email='theratingguard@gmail.com'),
    'email','theratingguard@gmail.com','role','authenticated')::text,true);
set local role authenticated;
do $$
declare rid uuid; first_id uuid; second_id uuid;
begin
  select r.id into strict rid from public.reviews r join public.scans s on s.id=r.scan_id
    where not s.is_seed and not exists(
      select 1 from public.removal_outcomes o where o.review_id=r.id
    ) limit 1;
  first_id:=public.save_case_memory(rid,'pending');
  second_id:=public.save_case_memory(rid,'pending');
  if first_id<>second_id then raise exception 'Memory upsert was not idempotent'; end if;
  if not exists(select 1 from public.case_memory where id=first_id and outcome='pending')
    then raise exception 'Memory not saved from real source review'; end if;
  begin
    perform public.save_case_memory(rid,'approved');
    raise exception 'Unrecorded approval accepted';
  exception when raise_exception then
    if sqlerrm<>'Record an actual decision before saving a decided memory' then raise; end if;
  end;
  update public.reports set report_data=report_data where scan_id=(
    select scan_id from public.reviews where id=rid
  );
end $$;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated","email":"fixture@example.invalid"}',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.case_memory) or exists(select 1 from public.learning_snapshots)
    then raise exception 'Case memory leaked to ordinary user'; end if;
  begin
    perform public.save_case_memory('00000000-0000-4000-8000-000000000000','pending');
    raise exception 'Ordinary user could write case memory';
  exception when raise_exception then
    if sqlerrm<>'Access Denied: case memory is Super Admin only' then raise; end if;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.case_memory;
    raise exception 'Anonymous memory read allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: real-source upsert, report trigger, forged-decision rejection, ordinary and anonymous privacy' as result;
rollback;
