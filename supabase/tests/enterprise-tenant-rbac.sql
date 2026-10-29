begin;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'rbac-org-a@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'rbac-org-b@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'rbac-escalation@example.test');

insert into public.resellers (id, name, slug) values
  ('20000000-0000-4000-8000-000000000001', 'RBAC Test Reseller A', 'rbac-test-a'),
  ('20000000-0000-4000-8000-000000000002', 'RBAC Test Reseller B', 'rbac-test-b');

insert into public.organizations (id, reseller_id, name, slug) values
  ('30000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 'RBAC Test Org A', 'rbac-test-org-a'),
  ('30000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002', 'RBAC Test Org B', 'rbac-test-org-b');

insert into public.organization_teams (id, organization_id, name, slug) values
  ('40000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 'RBAC Team A', 'rbac-team-a'),
  ('40000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000002', 'RBAC Team B', 'rbac-team-b');

insert into public.geographic_scopes (id, organization_id, scope_type, name) values
  ('50000000-0000-4000-8000-000000000001',
   '30000000-0000-4000-8000-000000000001', 'global', 'RBAC Geo Root A'),
  ('50000000-0000-4000-8000-000000000004',
   '30000000-0000-4000-8000-000000000002', 'global', 'RBAC Geo Root B');

insert into public.geographic_scopes (id, organization_id, parent_id, scope_type, name) values
  ('50000000-0000-4000-8000-000000000002',
   '30000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001', 'country', 'RBAC Country A'),
  ('50000000-0000-4000-8000-000000000003',
   '30000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000002', 'state', 'RBAC State A');

insert into rbac.role_definitions (code, name, scope_type)
values ('test_org_escalation', 'RBAC Test Escalation Role', 'organization');
insert into rbac.role_permission_grants (role_id, permission_key)
select role_row.id, 'platform.admin.manage'
from rbac.role_definitions role_row
where role_row.code = 'test_org_escalation';

insert into public.organization_memberships (organization_id, user_id, role_id)
select '30000000-0000-4000-8000-000000000001',
       '10000000-0000-4000-8000-000000000001',
       id
from rbac.role_definitions where code = 'organization_admin';
insert into public.organization_memberships (organization_id, user_id, role_id)
select '30000000-0000-4000-8000-000000000002',
       '10000000-0000-4000-8000-000000000002',
       id
from rbac.role_definitions where code = 'organization_admin';
insert into public.geographic_scope_memberships (geographic_scope_id, user_id, role_id)
select '50000000-0000-4000-8000-000000000002',
       '10000000-0000-4000-8000-000000000001',
       id
from rbac.role_definitions where code = 'country_manager';

do $$
begin
  begin
    insert into public.invitations (
      email, role_id, team_id, token_hash, invited_by, expires_at
    )
    select 'invalid-scope@example.test', id,
           '40000000-0000-4000-8000-000000000001',
           repeat('a', 64), '10000000-0000-4000-8000-000000000001',
           now() + interval '1 day'
    from rbac.role_definitions where code = 'client_user';
    raise exception 'Invitation accepted a role from a different scope';
  exception when raise_exception then
    if sqlerrm = 'Invitation accepted a role from a different scope' then
      raise;
    end if;
  end;
end
$$;

select set_config(
  'request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true
);
select set_config(
  'test.rbac.client_role',
  (select id::text from rbac.role_definitions where code = 'client_user'),
  true
);
select set_config(
  'test.rbac.escalation_role',
  (select id::text from rbac.role_definitions where code = 'test_org_escalation'),
  true
);
set local role authenticated;

do $$
declare
  client_role_id uuid := current_setting('test.rbac.client_role')::uuid;
  escalation_role_id uuid := current_setting('test.rbac.escalation_role')::uuid;
begin
  if not rbac.has_permission(
    'cases.read', null, '30000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Organization member lost same-tenant permission';
  end if;
  if rbac.has_permission(
    'cases.read', null, '30000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Organization member gained cross-tenant permission';
  end if;
  if (select count(*) from public.organizations
      where id = '30000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'RLS exposed another tenant organization';
  end if;
  if (select count(*) from public.organization_teams
      where id = '40000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'RLS exposed another tenant team';
  end if;
  if not rbac.has_permission(
    'cases.read', null, null, null, '50000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Country scope did not inherit permission to its child state';
  end if;
  if rbac.has_permission(
    'cases.read', null, null, null, '50000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Geographic permission crossed organization boundary';
  end if;
  if has_table_privilege('authenticated', 'public.invitations', 'select') then
    raise exception 'Authenticated users can read invitation token hashes';
  end if;

  begin
    update public.geographic_scopes
    set parent_id = '50000000-0000-4000-8000-000000000001'
    where id = '50000000-0000-4000-8000-000000000003';
    raise exception 'Authenticated user changed geographic scope structure';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.organization_memberships (organization_id, user_id, role_id)
    values (
      '30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      client_role_id
    );
    raise exception 'Cross-tenant membership insert was accepted';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.organization_memberships (organization_id, user_id, role_id)
    values (
      '30000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003',
      escalation_role_id
    );
    raise exception 'Role with unheld platform permission was assigned';
  exception when insufficient_privilege then
    null;
  end;

end
$$;

reset role;
set local role service_role;

do $$
begin
  begin
    update public.audit_events set action = 'tampered';
    raise exception 'Audit event mutation was accepted';
  exception when insufficient_privilege then
    null;
  end;
end
$$;

rollback;
