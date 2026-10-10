begin;
create temporary table quality_test_results(test text, result text);
do $$ declare admin_id uuid; ordinary_id uuid:=gen_random_uuid(); scan_id uuid; review_id uuid;
begin
  select id into strict admin_id from auth.users where email='theratingguard@gmail.com';
  insert into auth.users(id,email) values(ordinary_id,'quality-transaction-only@invalid.example');
  insert into public.scans(user_id,source_url,business_name,total_reviews)
    values(ordinary_id,'Transaction-only test fixture','Quality fixture',1) returning id into scan_id;
  insert into public.reviews(scan_id,author,rating,text) values(scan_id,'Transaction fixture',1,'Unit fixture only') returning id into review_id;
  perform set_config('quality.admin',admin_id::text,true);
  perform set_config('quality.ordinary',ordinary_id::text,true);
  perform set_config('quality.scan',scan_id::text,true);
  perform set_config('quality.review',review_id::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
end $$;
set local role authenticated;
do $$ declare outcome_id uuid; appeal_id uuid;
begin
  insert into public.removal_outcomes(review_id,scan_id,policy_type,business_type,submitted_at,
    verification_reference,request_text) values(current_setting('quality.review')::uuid,
    current_setting('quality.scan')::uuid,'Spam','Unit fixture',now()-interval '8 days',
    'Transaction-only reference','Transaction-only draft') returning id into outcome_id;
  select id into strict appeal_id from public.appeal_tracking where removal_request_id=outcome_id;
  if not exists(select 1 from public.appeal_tracking where id=appeal_id and
    due_at=(select submitted_at+interval '7 days' from public.removal_outcomes where id=outcome_id)) then
    raise exception 'Seven-day due date missing'; end if;
  begin
    update public.appeal_tracking set status='draft' where id=appeal_id;
    raise exception 'Pending request incorrectly eligible for appeal';
  exception when raise_exception then
    if sqlerrm='Pending request incorrectly eligible for appeal' then raise; end if;
  end;
  update public.removal_outcomes set outcome='rejected',response_at=now()-interval '1 day',
    verification_reference='Transaction-only decision reference' where id=outcome_id;
  if not exists(select 1 from public.appeal_tracking where id=appeal_id and status='needed') then
    raise exception 'Rejection did not schedule appeal'; end if;
  update public.appeal_tracking set status='draft',appeal_draft='Transaction-only appeal' where id=appeal_id;
  update public.appeal_tracking set status='submitted',submitted_at=now() where id=appeal_id;
  begin
    update public.appeal_tracking set submitted_at=now()+interval '1 second' where id=appeal_id;
    raise exception 'Second appeal submission permitted';
  exception when raise_exception then
    if sqlerrm='Second appeal submission permitted' then raise; end if;
  end;
  update public.removal_outcomes set outcome='approved',response_at=now() where id=outcome_id;
  if not exists(select 1 from public.appeal_tracking where id=appeal_id and status='closed') then
    raise exception 'Approved request did not close follow-up'; end if;
end $$;
reset role;
insert into quality_test_results values('Super Admin workflow','Submission, exact 7-day reminder, rejection guard, one-time appeal, approval closure PASS');
select set_config('request.jwt.claim.sub',current_setting('quality.ordinary'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.removal_outcomes) or exists(select 1 from public.appeal_tracking) then
    raise exception 'Ordinary account leaked private outcome records'; end if;
  begin
    insert into public.removal_outcomes(review_id,scan_id,policy_type,business_type,submitted_at,
      verification_reference,request_text) values(current_setting('quality.review')::uuid,
      current_setting('quality.scan')::uuid,'Spam','Unit fixture',now(),'Transaction reference','Unit draft');
    raise exception 'Ordinary account wrote outcomes';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
insert into quality_test_results values('Ordinary owner','No outcome/appeal details or submission writes PASS');
do $$ begin
  if has_table_privilege('anon','public.removal_outcomes','select') or
    has_table_privilege('authenticated','public.appeal_tracking','insert') then
    raise exception 'Private workflow privileges exposed'; end if;
end $$;
insert into quality_test_results values('Anonymous and appeal scheduling','No anonymous records; no browser-created appeal schedules PASS');
select * from quality_test_results;
rollback;
