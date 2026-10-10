begin;
create temporary table settings_results(test text,result text);
do $$ declare admin uuid; ordinary uuid:=gen_random_uuid();
begin
 select id into strict admin from auth.users where email='theratingguard@gmail.com';
 insert into auth.users(id,email) values(ordinary,'settings-transaction-only@invalid.example');
 perform set_config('test.admin',admin::text,true);
 perform set_config('test.ordinary',ordinary::text,true);
 perform set_config('request.jwt.claim.sub',admin::text,true);
 delete from public.scan_admissions where user_id=admin;
 delete from public.scan_start_slots;
end $$;
set local role authenticated;
do $$ declare config jsonb;
begin
 if (select count(*) from public.app_settings)<>14 then raise exception 'Missing settings'; end if;
 select jsonb_object_agg(key,value) into config from public.app_settings;
 perform public.update_app_settings(config||'{"claude_enabled":false,"rate_limit_per_min":2,"single_hourly_limit":2,"bulk_daily_limit":2}'::jsonb);
 if (select value from public.app_settings where key='claude_enabled')<>'false'::jsonb then raise exception 'Toggle not persisted'; end if;
 begin
   perform public.update_app_settings(config||'{"pdf_retention_days":91}');
   raise exception 'Invalid retention accepted';
 exception when check_violation then null; end;
 begin
   perform public.update_app_settings(config||'{"gpt_enabled":"true"}');
   raise exception 'Wrong type accepted';
 exception when check_violation then null; end;
 perform public.reserve_scan_admission('single',1);
 perform public.reserve_scan_admission('single',1);
 begin
   perform public.reserve_scan_admission('single',1);
   raise exception 'Single rate boundary not enforced';
 exception when raise_exception then
   if sqlerrm='Single rate boundary not enforced' then raise; end if;
 end;
 perform public.reserve_scan_admission('bulk',2);
 begin
   perform public.reserve_scan_admission('bulk',1);
   raise exception 'Bulk daily boundary not enforced';
 exception when raise_exception then
   if sqlerrm='Bulk daily boundary not enforced' then raise; end if;
 end;
 update public.app_settings set value='false' where key='bulk_scan_enabled';
 begin
   perform public.reserve_scan_admission('bulk',1);
   raise exception 'Disabled Bulk admitted';
 exception when raise_exception then
   if sqlerrm='Disabled Bulk admitted' then raise; end if;
 end;
 update public.app_settings set value='false' where key='appeal_tracking_enabled';
 if exists(select 1 from public.removal_outcomes) or exists(select 1 from public.appeal_tracking) then raise exception 'Disabled Appeal leaked details'; end if;
end $$;
reset role;
insert into settings_results values('Super Admin','Persistent typed settings, feature gates and exact limit boundaries PASS');
select set_config('request.jwt.claim.sub',current_setting('test.ordinary'),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.app_settings) or exists(select 1 from public.ai_model_status) then raise exception 'Ordinary private settings exposed'; end if;
 begin
  perform public.update_app_settings('{}');
  raise exception 'Ordinary RPC write permitted';
 exception when raise_exception then if sqlerrm='Ordinary RPC write permitted' then raise; end if; end;
 if (select count(*) from public.app_settings where key='gpt_enabled')<>0 then raise exception 'Ordinary settings leaked'; end if;
 begin
   insert into public.ai_model_status(model,result) values('gpt','{}');
   raise exception 'Ordinary test status write permitted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into settings_results values('Ordinary and anonymous','No settings/status reads or writes; no paid test RPC access PASS');
do $$ begin
 if has_function_privilege('anon','public.update_app_settings(jsonb)','execute')
   or has_function_privilege('authenticated','public.setting_value(text)','execute')
   or has_table_privilege('anon','public.app_settings','select') then raise exception 'Settings exposed'; end if;
end $$;
select * from settings_results;
rollback;
