begin;
create temporary table privacy_test_results(test text, result text);
do $$ declare owner uuid; stranger uuid := gen_random_uuid(); foreign_scan uuid; begin
  select id into owner from auth.users where email='theratingguard@gmail.com';
  if owner is null then raise exception 'Authorized test owner missing'; end if;
  insert into auth.users(id,email) values(stranger,'private-report-transaction-fixture@invalid.example');
  insert into public.scans(user_id,source_url,business_name,total_reviews)
    values(stranger,'Transaction-only privacy fixture','Foreign fixture',7) returning id into foreign_scan;
  perform set_config('private_test.owner',owner::text,true);
  perform set_config('private_test.foreign_scan',foreign_scan::text,true);
  perform set_config('request.jwt.claim.sub',owner::text,true);
end $$;
set local role authenticated;
do $$ begin
  if (select count(*) from public.reports)=0 then raise exception 'Owner lost report access'; end if;
  if exists(select 1 from public.scans where id=current_setting('private_test.foreign_scan')::uuid) then
    raise exception 'Owner can read another user'; end if;
end $$;
reset role;
insert into privacy_test_results values('Owner','Own reports visible; foreign scan denied');
insert into public.report_principals(user_id,access_level) values(current_setting('private_test.owner')::uuid,'franchise');
set local role authenticated;
do $$ declare t text; n integer; begin
  foreach t in array array['scans','reports','reviews','review_analyses','review_actions','scan_events','scan_jobs','error_events','audit_log'] loop
    execute format('select count(*) from public.%I',t) into n;
    if n<>0 then raise exception 'Franchise leaked % rows from %',n,t; end if;
  end loop;
  if not exists(select 1 from public.private_report_summaries()) then raise exception 'Summary missing'; end if;
  if exists(select 1 from public.private_report_summaries() where scan_id=current_setting('private_test.foreign_scan')::uuid)
    then raise exception 'Foreign summary leaked'; end if;
end $$;
reset role;
insert into privacy_test_results values('Franchise','All nine detail tables denied; owned summary visible');
update public.report_principals set access_level='reseller' where user_id=current_setting('private_test.owner')::uuid;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.reports) or exists(select 1 from public.reviews) or exists(select 1 from public.scans)
    then raise exception 'Reseller can read details'; end if;
  if public.can_download_selected_artifact(gen_random_uuid(),current_setting('private_test.foreign_scan')::uuid)
    then raise exception 'Unregistered artifact authorized'; end if;
end $$;
reset role;
insert into privacy_test_results values('Reseller','Details and unregistered PDF denied');
update public.report_principals set access_level='super_admin' where user_id=current_setting('private_test.owner')::uuid;
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.scans where id=current_setting('private_test.foreign_scan')::uuid)
    then raise exception 'Super Admin cannot view foreign scan'; end if;
end $$;
reset role;
insert into privacy_test_results values('Super Admin','Cross-owner read allowed only with explicit designation');
insert into privacy_test_results values('Privilege mutation',
  case when has_table_privilege('authenticated','public.report_principals','insert')
    or has_function_privilege('authenticated','public.register_private_selected_artifact(uuid,uuid,uuid)','execute')
    then 'FAILED' else 'Browser cannot grant roles or register PDF ownership' end);
do $$ begin
  if exists(select 1 from privacy_test_results where result='FAILED') then raise exception 'Privilege mutation exposed'; end if;
end $$;
select * from privacy_test_results;
rollback;
