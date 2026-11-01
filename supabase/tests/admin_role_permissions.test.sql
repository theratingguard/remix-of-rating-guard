begin;

select plan(12);

select ok(
  to_regclass('rbac.permission_catalog') is not null
    and to_regclass('rbac.role_definitions') is not null
    and to_regclass('rbac.role_permission_grants') is not null,
  'role and permission catalog tables exist'
);
select ok(
  exists (select 1 from rbac.role_definitions where code = 'super_admin')
    and exists (select 1 from rbac.permission_catalog where permission_key = 'cases.read'),
  'built-in roles and permission catalog are seeded'
);
select ok(
  to_regprocedure('public.admin_rbac_overview()') is not null,
  'Super Admin role-permission overview RPC exists'
);
select ok(
  to_regprocedure('public.admin_rbac_update_role_permissions(uuid,text[])') is not null,
  'role-permission update RPC exists'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.admin_rbac_overview()'::regprocedure),
  'role-permission overview runs with its restricted definer privileges'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.admin_rbac_update_role_permissions(uuid,text[])'::regprocedure),
  'role-permission updates run with their restricted definer privileges'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_rbac_overview()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.admin_rbac_overview()', 'EXECUTE')
    and has_function_privilege(
      'authenticated',
      'public.admin_rbac_update_role_permissions(uuid,text[])',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.admin_rbac_update_role_permissions(uuid,text[])',
      'EXECUTE'
    ),
  'only authenticated users can invoke the role-permission RPCs'
);
select ok(
  not has_table_privilege('authenticated', 'rbac.role_definitions', 'SELECT')
    and not has_table_privilege('authenticated', 'rbac.role_permission_grants', 'UPDATE'),
  'authenticated users cannot bypass the guarded RPCs'
);
select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid in (
     'rbac.permission_catalog'::regclass,
     'rbac.role_definitions'::regclass,
     'rbac.role_permission_grants'::regclass
   )),
  'row-level security is enabled on the permission catalog'
);
select ok(
  pg_get_functiondef('public.admin_rbac_overview()'::regprocedure)
    ilike '%report_access_level%'
    and pg_get_functiondef(
      'public.admin_rbac_update_role_permissions(uuid,text[])'::regprocedure
    ) ilike '%report_access_level%',
  'both RPCs verify Super Admin access'
);
select ok(
  pg_get_functiondef(
    'public.admin_rbac_update_role_permissions(uuid,text[])'::regprocedure
  ) ilike '%super_admin%'
    and pg_get_functiondef(
      'public.admin_rbac_update_role_permissions(uuid,text[])'::regprocedure
    ) ilike '%platform.admin.manage%',
  'platform administrator permissions are protected from reassignment'
);
select ok(
  pg_get_functiondef(
    'public.admin_rbac_update_role_permissions(uuid,text[])'::regprocedure
  ) ilike '%role_permissions_updated%'
    and pg_get_functiondef(
      'public.admin_rbac_update_role_permissions(uuid,text[])'::regprocedure
    ) ilike '%audit_logs%',
  'permission changes are written to the audit log'
);

select * from finish();
rollback;
