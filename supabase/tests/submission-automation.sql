begin;
select set_config('request.jwt.claims',
  jsonb_build_object('sub',(select id from auth.users where email='theratingguard@gmail.com'),
    'email','theratingguard@gmail.com','role','authenticated')::text,true);
do $$
declare rid uuid; sid uuid; uid uuid; oid uuid; n integer; worked boolean;
begin
  select r.id,r.scan_id into strict rid,sid from public.reviews r
    join public.scans s on s.id=r.scan_id where not s.is_seed
    and not exists(select 1 from public.removal_outcomes where review_id=r.id) limit 1;
  select id into strict uid from auth.users where email='theratingguard@gmail.com';
  insert into public.removal_outcomes(review_id,scan_id,user_id,policy_type,business_type,
    submitted_at,verification_reference,request_text)
    values(rid,sid,uid,'Spam','SQL rollback fixture',now()-interval '2 days',
      'Rollback fixture only; not an actual Google submission','Rollback test draft')
    returning id into oid;
  if not exists(select 1 from public.submission_status where removal_request_id=oid and status='submitted')
    then raise exception 'Submission trigger failed'; end if;
  perform public.record_submission_followup(oid,now());
  perform public.record_submission_followup(oid,now());
  select count(*) into n from public.submission_notifications where removal_request_id=oid and event='followup_due';
  if n<>1 then raise exception 'Duplicate reminder produced'; end if;
  update public.removal_outcomes set outcome='rejected',response_at=now(),verification_reference='Rollback fixture verified rejection' where id=oid;
  update public.removal_outcomes set outcome=outcome where id=oid;
  if not exists(select 1 from public.submission_status where removal_request_id=oid and status='rejected')
    then raise exception 'Decision sync failed'; end if;
  select count(*) into n from public.submission_notifications where removal_request_id=oid;
  if n<>5 then raise exception 'Expected submitted,followup,rejected,response,appeal once each; got %',n; end if;
  worked:=public.record_submission_followup(oid,now());
  if worked then raise exception 'Reminder on decided case accepted'; end if;
  begin
    perform public.record_submission_followup(oid,now()+interval '1 day');
    raise exception 'Future check accepted';
  exception when raise_exception then
    if sqlerrm<>'Invalid follow-up timestamp' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated","email":"fixture@example.invalid"}',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.submission_status) or exists(select 1 from public.submission_notifications)
    then raise exception 'Private submission data leaked'; end if;
  begin
    perform public.record_submission_followup('00000000-0000-4000-8000-000000000000',now());
    raise exception 'Ordinary user invoked service RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.submission_status;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: submission sync, decision notifications, daily reminder deduplication, decided/future guards, ordinary and anonymous privacy' as result;
rollback;
