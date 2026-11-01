begin;

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
