begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',
  (select id from auth.users where email='theratingguard@gmail.com'),'email','theratingguard@gmail.com','role','authenticated')::text,true);
set local role authenticated;
insert into public.service_checks(service,success,detail,checked_at)
 values('google',true,'Rollback-only diagnostic fixture',now())
 on conflict(service) do update set success=excluded.success,detail=excluded.detail,checked_at=excluded.checked_at;
do $$ begin
 if not exists(select 1 from public.service_checks where service='google' and success) then raise exception 'Super Admin diagnostic persistence failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated","email":"fixture@example.invalid"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.service_checks) then raise exception 'Ordinary account diagnostic leak'; end if;
 begin
  insert into public.service_checks(service,success,detail) values('google',true,'Unauthorized fixture');
  raise exception 'Ordinary account diagnostic write allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform service from public.service_checks;
  raise exception 'Anonymous diagnostic access allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
