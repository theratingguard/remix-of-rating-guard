begin;

select plan(26);

select ok(to_regclass('public.reseller_plans') is not null, 'reseller plans table is present');
select ok(to_regclass('public.reseller_memberships') is not null, 'membership table is present');
select ok(to_regclass('public.reseller_commissions') is not null, 'commission ledger is present');
select ok(to_regclass('public.payout_requests') is not null, 'payout requests table is present');
select ok(to_regclass('public.review_removal_orders') is not null, 'removal orders table is present');
select ok(to_regclass('public.audit_logs') is not null, 'commerce audit table is present');
select is(
  (select count(*)::integer from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'reseller_plans', 'reseller_memberships', 'reseller_commissions',
       'payout_requests', 'review_removal_orders', 'audit_logs'
     )
     and c.relrowsecurity),
  6,
  'all commerce tables enforce row-level security'
);
select is(
  (select count(*)::integer from public.reseller_plans
   where (id, annual_fee_cents, commission_bps) in (
     ('starter', 9900, 3000),
     ('professional', 24900, 4000),
     ('enterprise', 49900, 5000)
   )),
  3,
  'the three initial plan prices and commission rates are seeded'
);
select ok(
  pg_get_constraintdef((
    select oid from pg_constraint
    where conrelid = 'public.review_removal_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%price_cents%'
  )) like '%4900%',
  '$49 is the database-enforced price per review'
);
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'review_removal_orders_review_id_key'),
  'a review cannot receive duplicate removal orders'
);
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'reseller_commissions_order_unique_idx'),
  'each removal order can create at most one commission'
);
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'reseller_commissions_referral_unique_idx'),
  'each referred client has one attribution record'
);
select ok(
  exists(select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'reseller_membership_one_active_idx'),
  'a reseller cannot have multiple active memberships'
);
select ok(
  has_function_privilege('authenticated', 'public.submit_review_removal_orders(uuid,uuid[])', 'EXECUTE'),
  'authenticated users can submit requests through the server-checked RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.review_removal_orders', 'INSERT'),
  'clients cannot insert orders directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.reseller_commissions', 'UPDATE'),
  'clients and resellers cannot update commission amounts or statuses directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.reseller_memberships', 'INSERT'),
  'users cannot create paid memberships directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.payout_requests', 'INSERT'),
  'resellers can request payouts only through the guarded RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_logs', 'INSERT'),
  'users cannot forge commerce audit entries'
);
select ok(
  (select prosecdef from pg_proc
   where oid = 'public.record_reseller_commerce_signup()'::regprocedure),
  'signup role and membership assignment runs in the trusted trigger'
);
select ok(
  pg_get_functiondef('public.record_reseller_commerce_signup()'::regprocedure)
    like '%reseller_plan%'
    and pg_get_functiondef('public.record_reseller_commerce_signup()'::regprocedure)
      like '%is_active%',
  'reseller registration accepts only an active plan'
);
select ok(
  pg_get_functiondef('public.admin_confirm_review_payment(uuid,text)'::regprocedure)
    like '%payment_due%',
  'client payment can be recorded only after a verified-removal state'
);
select ok(
  pg_get_functiondef('public.admin_update_review_removal_order(uuid,text,text)'::regprocedure)
    like '%submitted_to_google%'
    and pg_get_functiondef('public.admin_update_review_removal_order(uuid,text,text)'::regprocedure)
      like '%google_reference%',
  'Google decision recording requires a prior submission and reference'
);
select ok(
  pg_get_functiondef('public.admin_update_review_removal_order(uuid,text,text)'::regprocedure)
    like '%14 days%'
    and pg_get_functiondef('public.admin_update_review_removal_order(uuid,text,text)'::regprocedure)
      like '%amount_cents%',
  'commission amount is calculated in cents and held for 14 days'
);
select ok(
  pg_get_functiondef('public.request_reseller_payout()'::regprocedure)
    like '%for update%'
    and pg_get_functiondef('public.request_reseller_payout()'::regprocedure)
      like '%status = ''available''%',
  'payout reservation locks the reseller row and uses matured commissions'
);
select ok(
  pg_get_functiondef('public.admin_review_payout(uuid,text,text)'::regprocedure)
    like '%Only an approved payout can be marked paid%'
    and pg_get_functiondef('public.admin_review_payout(uuid,text,text)'::regprocedure)
      like '%Superadmin access required%',
  'payout payment requires Superadmin authorization and prior approval'
);

select * from finish();
rollback;
