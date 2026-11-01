begin;

create schema if not exists rbac;
revoke all on schema rbac from public, anon;
grant usage on schema rbac to authenticated, service_role;

create table if not exists rbac.permission_catalog (
  permission_key text primary key check (permission_key ~ '^[a-z][a-z0-9_.-]*$'),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists rbac.role_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  scope_type text not null check (
    scope_type in ('platform', 'reseller', 'organization', 'team', 'geography')
  ),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rbac.role_permission_grants (
  role_id uuid not null references rbac.role_definitions(id) on delete cascade,
  permission_key text not null references rbac.permission_catalog(permission_key) on delete cascade,
  primary key (role_id, permission_key)
);

insert into rbac.permission_catalog (permission_key, description) values
  ('platform.admin.manage', 'Manage platform-wide administration'),
  ('resellers.read', 'Read an authorized reseller account'),
  ('resellers.manage', 'Create or manage authorized reseller accounts'),
  ('organizations.read', 'Read organizations in the authorized scope'),
  ('organizations.manage', 'Create or manage organizations in the authorized scope'),
  ('teams.read', 'Read teams in the authorized scope'),
  ('teams.manage', 'Create or manage teams in the authorized scope'),
  ('members.read', 'Read memberships in the authorized scope'),
  ('members.manage', 'Add, suspend, or remove memberships in the authorized scope'),
  ('members.invite', 'Invite users into the authorized scope'),
  ('rbac.roles.read', 'Read role assignments in the authorized scope'),
  ('rbac.roles.assign', 'Assign only roles whose permissions the actor already holds'),
  ('geographic_scopes.read', 'Read geographic scopes in the authorized organization'),
  ('geographic_scopes.manage', 'Manage geographic scopes in the authorized organization'),
  ('cases.read', 'Read cases in the authorized scope'),
  ('cases.manage', 'Manage cases in the authorized scope'),
  ('reviews.read', 'Read review analysis in the authorized scope'),
  ('reviews.manage', 'Manage review analysis in the authorized scope'),
  ('reports.read', 'Read reports in the authorized scope'),
  ('audit_events.read', 'Read audit events in the authorized scope'),
  ('data.export', 'Export records in the authorized scope'),
  ('billing.manage', 'Manage commercial settings in the authorized scope')
on conflict (permission_key) do nothing;

insert into rbac.role_definitions (code, name, scope_type, is_system) values
  ('super_admin', 'Platform Super Admin', 'platform', true),
  ('reseller_admin', 'Reseller Admin', 'reseller', true),
  ('organization_admin', 'Organization Admin', 'organization', true),
  ('team_manager', 'Team Manager', 'team', true),
  ('team_leader', 'Team Leader', 'team', true),
  ('team_member', 'Team Member', 'team', true),
  ('client_user', 'Client User', 'organization', true),
  ('global_manager', 'Global Manager', 'geography', true),
  ('country_manager', 'Country Manager', 'geography', true),
  ('state_manager', 'State Manager', 'geography', true),
  ('divisional_manager', 'Divisional Manager', 'geography', true),
  ('district_manager', 'District Manager', 'geography', true)
on conflict (code) do nothing;

insert into rbac.role_permission_grants (role_id, permission_key)
select roles.id, permissions.permission_key
from rbac.role_definitions roles
cross join rbac.permission_catalog permissions
where roles.code = 'super_admin'
on conflict do nothing;

insert into rbac.role_permission_grants (role_id, permission_key)
select roles.id, permissions.permission_key
from rbac.role_definitions roles
join rbac.permission_catalog permissions
  on permissions.permission_key in (
    'organizations.read', 'organizations.manage',
    'teams.read', 'teams.manage',
    'members.read', 'members.manage', 'members.invite',
    'rbac.roles.read', 'rbac.roles.assign',
    'geographic_scopes.read', 'geographic_scopes.manage',
    'cases.read', 'cases.manage', 'reviews.read', 'reviews.manage',
    'reports.read', 'audit_events.read', 'data.export', 'billing.manage'
  )
where roles.code in ('reseller_admin', 'organization_admin')
on conflict do nothing;

insert into rbac.role_permission_grants (role_id, permission_key)
select roles.id, permissions.permission_key
from rbac.role_definitions roles
join rbac.permission_catalog permissions
  on permissions.permission_key in (
    'teams.read', 'members.read', 'members.manage', 'members.invite',
    'rbac.roles.read', 'rbac.roles.assign',
    'cases.read', 'cases.manage', 'reviews.read', 'reviews.manage',
    'reports.read', 'audit_events.read', 'data.export'
  )
where roles.code in ('team_manager', 'team_leader')
on conflict do nothing;

insert into rbac.role_permission_grants (role_id, permission_key)
select roles.id, permissions.permission_key
from rbac.role_definitions roles
join rbac.permission_catalog permissions
  on permissions.permission_key in ('cases.read', 'reviews.read', 'reports.read')
where roles.code = 'team_member'
on conflict do nothing;

insert into rbac.role_permission_grants (role_id, permission_key)
select roles.id, permissions.permission_key
from rbac.role_definitions roles
join rbac.permission_catalog permissions
  on permissions.permission_key in (
    'organizations.read', 'cases.read', 'reviews.read', 'reports.read'
  )
where roles.code = 'client_user'
on conflict do nothing;

insert into rbac.role_permission_grants (role_id, permission_key)
select roles.id, permissions.permission_key
from rbac.role_definitions roles
join rbac.permission_catalog permissions
  on permissions.permission_key in (
    'organizations.read', 'teams.read', 'members.read', 'members.manage',
    'members.invite', 'rbac.roles.read', 'rbac.roles.assign',
    'geographic_scopes.read', 'geographic_scopes.manage',
    'cases.read', 'cases.manage', 'reviews.read', 'reviews.manage',
    'reports.read', 'audit_events.read', 'data.export'
  )
where roles.code in (
  'global_manager', 'country_manager', 'state_manager',
  'divisional_manager', 'district_manager'
)
on conflict do nothing;

alter table rbac.permission_catalog enable row level security;
alter table rbac.role_definitions enable row level security;
alter table rbac.role_permission_grants enable row level security;

revoke all on rbac.permission_catalog, rbac.role_definitions,
  rbac.role_permission_grants from public, anon, authenticated;
grant all on rbac.permission_catalog, rbac.role_definitions,
  rbac.role_permission_grants to service_role;

create or replace function public.admin_rbac_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  overview jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  if public.report_access_level() is distinct from 'super_admin' then
    raise exception 'Super Admin access required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'permissions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', catalog.permission_key,
          'description', catalog.description
        ) order by catalog.permission_key
      )
      from rbac.permission_catalog catalog
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', role_rows.id,
          'code', role_rows.code,
          'name', role_rows.name,
          'scope_type', role_rows.scope_type,
          'is_system', role_rows.is_system,
          'permissions', role_rows.permissions
        ) order by role_rows.scope_type, role_rows.name
      )
      from (
        select
          roles.id,
          roles.code,
          roles.name,
          roles.scope_type,
          roles.is_system,
          coalesce(
            array_agg(grants.permission_key order by grants.permission_key)
              filter (where grants.permission_key is not null),
            array[]::text[]
          ) as permissions
        from rbac.role_definitions roles
        left join rbac.role_permission_grants grants on grants.role_id = roles.id
        group by roles.id
      ) role_rows
    ), '[]'::jsonb)
  ) into overview;

  return overview;
end
$$;

create or replace function public.admin_rbac_update_role_permissions(
  _role_id uuid,
  _permission_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_role rbac.role_definitions%rowtype;
  previous_permissions text[];
  requested_permissions text[];
begin
  if actor_id is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  if public.report_access_level() is distinct from 'super_admin' then
    raise exception 'Super Admin access required' using errcode = '42501';
  end if;
  if _permission_keys is null then
    raise exception 'Permission selection is required';
  end if;

  select * into target_role
  from rbac.role_definitions
  where id = _role_id
  for update;
  if not found then
    raise exception 'Role not found';
  end if;
  if target_role.code = 'super_admin' then
    raise exception 'The Super Admin permission set cannot be changed';
  end if;

  select coalesce(array_agg(distinct selected.permission_key order by selected.permission_key), array[]::text[])
    into requested_permissions
  from unnest(_permission_keys) as selected(permission_key);

  if exists (
    select 1
    from unnest(requested_permissions) as selected(permission_key)
    left join rbac.permission_catalog catalog
      on catalog.permission_key = selected.permission_key
    where catalog.permission_key is null
  ) then
    raise exception 'One or more permissions are not in the permission catalog';
  end if;
  if 'platform.admin.manage' = any(requested_permissions) then
    raise exception 'Platform administration can only be assigned to Super Admin';
  end if;

  select coalesce(array_agg(grants.permission_key order by grants.permission_key), array[]::text[])
    into previous_permissions
  from rbac.role_permission_grants grants
  where grants.role_id = target_role.id;

  delete from rbac.role_permission_grants
  where role_id = target_role.id;

  insert into rbac.role_permission_grants (role_id, permission_key)
  select target_role.id, selected.permission_key
  from unnest(requested_permissions) as selected(permission_key);

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, details
  ) values (
    actor_id,
    'role_permissions_updated',
    'rbac_role',
    target_role.id,
    jsonb_build_object(
      'role_code', target_role.code,
      'before', to_jsonb(previous_permissions),
      'after', to_jsonb(requested_permissions)
    )
  );

  return jsonb_build_object(
    'role_id', target_role.id,
    'permissions', requested_permissions
  );
end
$$;

revoke all on function public.admin_rbac_overview() from public, anon;
revoke all on function public.admin_rbac_update_role_permissions(uuid, text[]) from public, anon;
grant execute on function public.admin_rbac_overview() to authenticated;
grant execute on function public.admin_rbac_update_role_permissions(uuid, text[]) to authenticated;

notify pgrst, 'reload schema';
commit;
