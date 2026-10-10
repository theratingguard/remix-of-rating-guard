begin;
select set_config('request.jwt.claims',
  jsonb_build_object('sub',(select id from auth.users where email='theratingguard@gmail.com'),
    'email','theratingguard@gmail.com','role','authenticated')::text,true);
set local role authenticated;
do $$
declare item record; request_id uuid; history_row record; sample jsonb;
begin
  if public.report_access_level()<>'super_admin' then raise exception 'Super Admin fixture unavailable'; end if;
  sample=public.smart_alerts_sample();
  if jsonb_typeof(sample->'reviews')<>'array' or jsonb_typeof(sample->'outcomes')<>'array' then
    raise exception 'Unexpected Smart Alerts shape';
  end if;
  select r.id,r.scan_id into item from public.reviews r join public.scans s on s.id=r.scan_id
    where not s.is_seed and not exists(select 1 from public.removal_outcomes o where o.review_id=r.id)
    limit 1;
  if item.id is null then raise exception 'Need one real review without a removal record for transaction fixture'; end if;
  insert into public.removal_outcomes(review_id,scan_id,policy_type,business_type,submitted_at,
    verification_reference,request_text,evidence_used)
    values(item.id,item.scan_id,'TRANSACTION TEST POLICY','TRANSACTION TEST TYPE',now()-interval '3 days',
      'ROLLBACK ONLY, not a real Google decision','ROLLBACK ONLY, not submitted',
      '{"evidence_strength":50}'::jsonb) returning id into request_id;
  if exists(select 1 from public.removal_history where id=request_id) then raise exception 'Pending request leaked into decided history'; end if;
  update public.removal_outcomes set outcome='approved',response_at=now()-interval '1 day'
    where id=request_id;
  select * into history_row from public.removal_history where id=request_id;
  if history_row.id is null or history_row.evidence_strength<>50 or history_row.days_to_response<>2 then
    raise exception 'History evidence or response duration incorrect';
  end if;
  update public.removal_outcomes set evidence_used='{}'::jsonb where id=request_id;
  if (select evidence_strength from public.removal_history where id=request_id) is not null then
    raise exception 'Missing evidence must not be inferred from readiness';
  end if;
  raise notice 'PASS: Super Admin insights shape, pending exclusion, approved history, evidence strength, response duration';
end $$;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000000","email":"ordinary-fixture@example.invalid","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.removal_history) then raise exception 'Ordinary account history leak'; end if;
  begin
    perform public.smart_alerts_sample();
    raise exception 'Ordinary account unexpectedly granted insights';
  exception when raise_exception then
    if sqlerrm not like 'Access Denied:%' then raise; end if;
  end;
  raise notice 'PASS: ordinary-account history hidden and insights denied';
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.smart_alerts_sample();
    raise exception 'Anonymous unexpectedly granted insights';
  exception when insufficient_privilege then null;
  end;
  begin
    perform id from public.removal_history limit 1;
    raise exception 'Anonymous unexpectedly granted history';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: anonymous insights and history privilege denied';
end $$;
rollback;
