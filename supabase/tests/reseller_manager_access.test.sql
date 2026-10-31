begin;

select plan(15);

select ok(
  to_regclass('public.reseller_businesses') is not null,
  'reseller client links table exists'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.reseller_businesses'::regclass),
  'reseller client links enforce row-level security'
);
select ok(
  not has_table_privilege('authenticated', 'public.reseller_businesses', 'INSERT')
    and not has_table_privilege('authenticated', 'public.reseller_businesses', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.reseller_businesses', 'DELETE'),
  'resellers cannot write client links outside guarded backend operations'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reseller_businesses'
      and policyname = 'reseller_businesses_owner_read'
      and roles @> array['authenticated']::name[]
      and qual ilike '%reseller_id%'
      and qual ilike '%auth.uid%'
  ),
  'client reads are restricted to the reseller owner or Super Admin'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'teams'
      and policyname = 'teams_reseller_owner_read'
      and qual ilike '%reseller_id%'
      and qual ilike '%auth.uid%'
  ),
  'reseller team reads are restricted to their own teams'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.reseller_commissions'::regclass),
  'commission ledger enforces row-level security'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reseller_commissions'
      and policyname = 'reseller_commission_owner_or_admin_read'
      and qual ilike '%reseller_id%'
      and qual ilike '%auth.uid%'
  ),
  'commission reads are restricted to their owner or Super Admin'
);
select ok(
  not has_table_privilege('authenticated', 'public.reseller_commissions', 'INSERT')
    and not has_table_privilege('authenticated', 'public.reseller_commissions', 'UPDATE'),
  'resellers cannot forge or edit commission entries'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_reseller_work_summary()',
    'EXECUTE'
  ),
  'authenticated callers can request the guarded manager summary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_reseller_work_summary()',
    'EXECUTE'
  ),
  'anonymous callers cannot request the manager summary'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.admin_reseller_work_summary()'::regprocedure),
  'manager summary uses a security-definer function'
);
select ok(
  pg_get_functiondef('public.admin_reseller_work_summary()'::regprocedure)
    ilike '%report_access_level%'
    and pg_get_functiondef('public.admin_reseller_work_summary()'::regprocedure)
      ilike '%super_admin%',
  'manager summary checks Super Admin access before returning reseller details'
);
select ok(
  to_regclass('public.internal_chat_presence') is not null
    and (select relrowsecurity
         from pg_class
         where oid = 'public.internal_chat_presence'::regclass),
  'internal chat presence enforces row-level security'
);
select ok(
  not has_table_privilege('authenticated', 'public.internal_chat_presence', 'INSERT')
    and not has_table_privilege('authenticated', 'public.internal_chat_presence', 'UPDATE'),
  'chat clients update presence only through the own-user RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.touch_internal_chat_presence()',
    'EXECUTE'
  ),
  'authenticated chat users can update their own presence through the RPC'
);

select * from finish();
rollback;
