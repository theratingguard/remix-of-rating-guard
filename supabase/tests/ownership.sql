-- Transaction-only policy fixtures, not real users, reviews or scan results.
-- Run only after application.sql; no fixtures survive a successful run.
begin;
insert into auth.users(id) values
  ('b95fa860-014d-4a5e-9579-bd6d21ad0051'),
  ('b95fa860-014d-4a5e-9579-bd6d21ad0052');
insert into public.scans(id, user_id, source_url) values
  ('a95fa860-014d-4a5e-9579-bd6d21ad0051', 'b95fa860-014d-4a5e-9579-bd6d21ad0051', 'transaction-only-rls-fixture'),
  ('a95fa860-014d-4a5e-9579-bd6d21ad0052', 'b95fa860-014d-4a5e-9579-bd6d21ad0052', 'transaction-only-rls-fixture');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b95fa860-014d-4a5e-9579-bd6d21ad0051', true);
do $$
begin
  if (select count(*) from public.scans) <> 1 then
    raise exception 'RLS isolation failed';
  end if;
  begin
    insert into public.profiles(user_id, name)
      values ('b95fa860-014d-4a5e-9579-bd6d21ad0052', 'forbidden fixture');
    raise exception 'Cross-owner insert accepted';
  exception when insufficient_privilege then null;
  end;
  insert into public.profiles(user_id, name)
    values ('b95fa860-014d-4a5e-9579-bd6d21ad0051', 'transaction fixture');
end $$;
select 'Owner read/write passed; cross-owner read/write blocked; fixtures rolled back' as rls_test;
rollback;
