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

create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists resellers_slug_lower_unique on public.resellers (lower(slug));

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid references public.resellers(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, reseller_id)
);
create unique index if not exists organizations_direct_slug_unique
  on public.organizations (lower(slug)) where reseller_id is null;
create unique index if not exists organizations_reseller_slug_unique
  on public.organizations (reseller_id, lower(slug)) where reseller_id is not null;
create index if not exists organizations_reseller_id_idx on public.organizations (reseller_id);

create table if not exists public.organization_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);
create index if not exists organization_teams_organization_id_idx
  on public.organization_teams (organization_id);

create table if not exists public.geographic_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_id uuid,
  scope_type text not null check (
    scope_type in ('global', 'country', 'state', 'division', 'district')
  ),
  name text not null check (length(trim(name)) between 1 and 200),
  code text,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (parent_id, organization_id)
    references public.geographic_scopes(id, organization_id) on delete restrict,
  check (parent_id is null or parent_id <> id)
);
create unique index if not exists geographic_scopes_code_unique
  on public.geographic_scopes (organization_id, lower(code))
  where code is not null;
create index if not exists geographic_scopes_parent_idx
  on public.geographic_scopes (organization_id, parent_id);
create unique index if not exists geographic_scopes_single_global_root
  on public.geographic_scopes (organization_id)
  where scope_type = 'global';

create or replace function public.validate_geographic_scope_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_scope_type text;
  required_parent_type text;
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and (
    new.organization_id is distinct from old.organization_id
    or new.parent_id is distinct from old.parent_id
    or new.scope_type is distinct from old.scope_type
  ) then
    raise exception 'Geographic scope structure requires trusted administration'
      using errcode = 'insufficient_privilege';
  end if;

  if new.parent_id is null then
    if new.scope_type <> 'global' then
      raise exception 'Only a global scope may be a geographic root';
    end if;
    return new;
  end if;

  select parent.scope_type into parent_scope_type
  from public.geographic_scopes parent
  where parent.id = new.parent_id
    and parent.organization_id = new.organization_id;
  if not found then
    raise exception 'Geographic parent must exist in the same organization';
  end if;

  if exists (
    with recursive ancestors(id, parent_id) as (
      select parent.id, parent.parent_id
      from public.geographic_scopes parent where parent.id = new.parent_id
      union
      select parent.id, parent.parent_id
      from public.geographic_scopes parent
      join ancestors child on child.parent_id = parent.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'Geographic hierarchy cannot contain a cycle';
  end if;

  required_parent_type := case new.scope_type
    when 'country' then 'global'
    when 'state' then 'country'
    when 'division' then 'state'
    when 'district' then 'division'
    else null
  end;
  if required_parent_type is null or parent_scope_type <> required_parent_type then
    raise exception 'Geographic parent type does not match the hierarchy';
  end if;
  return new;
end
$$;

create trigger geographic_scope_tree_guard
  before insert or update on public.geographic_scopes
  for each row execute function public.validate_geographic_scope_tree();

create table if not exists public.platform_admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references rbac.role_definitions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_reseller_memberships (
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references rbac.role_definitions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (reseller_id, user_id)
);
create index if not exists tenant_reseller_memberships_user_idx
  on public.tenant_reseller_memberships (user_id);

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references rbac.role_definitions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists organization_memberships_user_idx on public.organization_memberships (user_id);

create table if not exists public.team_memberships (
  team_id uuid not null references public.organization_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references rbac.role_definitions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_memberships_user_idx on public.team_memberships (user_id);

create table if not exists public.geographic_scope_memberships (
  geographic_scope_id uuid not null references public.geographic_scopes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references rbac.role_definitions(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (geographic_scope_id, user_id)
);
create index if not exists geographic_scope_memberships_user_idx
  on public.geographic_scope_memberships (user_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(trim(email)) between 3 and 320),
  role_id uuid not null references rbac.role_definitions(id) on delete restrict,
  reseller_id uuid references public.resellers(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  team_id uuid references public.organization_teams(id) on delete cascade,
  geographic_scope_id uuid references public.geographic_scopes(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(reseller_id, organization_id, team_id, geographic_scope_id) = 1),
  check (expires_at > created_at),
  check ((status = 'accepted') = (accepted_at is not null))
);
create unique index if not exists invitations_pending_reseller_email_unique
  on public.invitations (lower(email), reseller_id)
  where status = 'pending' and reseller_id is not null;
create unique index if not exists invitations_pending_organization_email_unique
  on public.invitations (lower(email), organization_id)
  where status = 'pending' and organization_id is not null;
create unique index if not exists invitations_pending_team_email_unique
  on public.invitations (lower(email), team_id)
  where status = 'pending' and team_id is not null;
create unique index if not exists invitations_pending_geographic_email_unique
  on public.invitations (lower(email), geographic_scope_id)
  where status = 'pending' and geographic_scope_id is not null;
create index if not exists invitations_expires_at_idx on public.invitations (expires_at)
  where status = 'pending';

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete restrict,
  subject_user_id uuid references auth.users(id) on delete restrict,
  reseller_id uuid references public.resellers(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  team_id uuid references public.organization_teams(id) on delete restrict,
  geographic_scope_id uuid references public.geographic_scopes(id) on delete restrict,
  action text not null check (length(trim(action)) between 1 and 160),
  resource_type text not null check (length(trim(resource_type)) between 1 and 120),
  resource_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_org_created_idx
  on public.audit_events (organization_id, created_at desc);
create index if not exists audit_events_reseller_created_idx
  on public.audit_events (reseller_id, created_at desc);
create index if not exists audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc);

create or replace function public.validate_invitation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_scope text;
begin
  if new.reseller_id is not null then
    expected_scope := 'reseller';
  elsif new.organization_id is not null then
    expected_scope := 'organization';
  elsif new.team_id is not null then
    expected_scope := 'team';
  elsif new.geographic_scope_id is not null then
    expected_scope := 'geography';
  else
    raise exception 'Invitation requires exactly one scope';
  end if;

  if not exists (
    select 1 from rbac.role_definitions r
    where r.id = new.role_id and r.scope_type = expected_scope
  ) then
    raise exception 'Invitation role scope does not match invitation scope';
  end if;

  return new;
end
$$;

create trigger invitations_scope_guard
  before insert or update on public.invitations
  for each row execute function public.validate_invitation_scope();

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
where roles.code = 'reseller_admin'
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
where roles.code = 'organization_admin'
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

create or replace function rbac.has_permission(
  _permission_key text,
  _reseller_id uuid default null,
  _organization_id uuid default null,
  _team_id uuid default null,
  _geographic_scope_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  team_org_id uuid;
  team_status text;
  geo_org_id uuid;
  target_org_id uuid;
  target_org_status text;
  target_reseller_id uuid;
  target_reseller_status text;
begin
  if actor_id is null
    or not exists (
      select 1 from rbac.permission_catalog p
      where p.permission_key = _permission_key
    )
  then
    return false;
  end if;

  if _team_id is not null then
    select t.organization_id, t.status into team_org_id, team_status
    from public.organization_teams t where t.id = _team_id;
    if not found then return false; end if;
    if team_status <> 'active' then return false; end if;
  end if;

  if _geographic_scope_id is not null then
    select g.organization_id into geo_org_id
    from public.geographic_scopes g where g.id = _geographic_scope_id;
    if not found then return false; end if;
  end if;

  if _organization_id is not null then
    select o.reseller_id, o.status
      into target_reseller_id, target_org_status
    from public.organizations o where o.id = _organization_id;
    if not found or target_org_status <> 'active' then return false; end if;
  end if;

  if _organization_id is not null and team_org_id is not null
    and _organization_id <> team_org_id
  then
    return false;
  end if;
  if _organization_id is not null and geo_org_id is not null
    and _organization_id <> geo_org_id
  then
    return false;
  end if;
  if team_org_id is not null and geo_org_id is not null
    and team_org_id <> geo_org_id
  then
    return false;
  end if;

  target_org_id := coalesce(_organization_id, team_org_id, geo_org_id);
  if target_org_id is not null then
    select o.reseller_id, o.status
      into target_reseller_id, target_org_status
    from public.organizations o where o.id = target_org_id;
    if not found or target_org_status <> 'active' then return false; end if;
    if _reseller_id is not null and target_reseller_id is distinct from _reseller_id then
      return false;
    end if;
  elsif _reseller_id is not null then
    if not exists (select 1 from public.resellers r where r.id = _reseller_id) then
      return false;
    end if;
    target_reseller_id := _reseller_id;
  end if;

  if target_reseller_id is not null then
    select r.status into target_reseller_status
    from public.resellers r where r.id = target_reseller_id;
    if not found or target_reseller_status <> 'active' then return false; end if;
  end if;

  return exists (
    select 1
    from public.platform_admin_memberships m
    join rbac.role_permission_grants rp on rp.role_id = m.role_id
    where m.user_id = actor_id and m.status = 'active'
      and rp.permission_key = _permission_key
  )
  or (
    target_reseller_id is not null and exists (
      select 1
      from public.tenant_reseller_memberships m
      join rbac.role_permission_grants rp on rp.role_id = m.role_id
      where m.user_id = actor_id and m.status = 'active'
        and m.reseller_id = target_reseller_id
        and rp.permission_key = _permission_key
    )
  )
  or (
    target_org_id is not null and exists (
      select 1
      from public.organization_memberships m
      join rbac.role_permission_grants rp on rp.role_id = m.role_id
      where m.user_id = actor_id and m.status = 'active'
        and m.organization_id = target_org_id
        and rp.permission_key = _permission_key
    )
  )
  or (
    _team_id is not null and exists (
      select 1
      from public.team_memberships m
      join rbac.role_permission_grants rp on rp.role_id = m.role_id
      where m.user_id = actor_id and m.status = 'active'
        and m.team_id = _team_id
        and rp.permission_key = _permission_key
    )
  )
  or (
    _geographic_scope_id is not null and exists (
      with recursive ancestors(id, parent_id) as (
        select g.id, g.parent_id
        from public.geographic_scopes g where g.id = _geographic_scope_id
        union all
        select parent.id, parent.parent_id
        from public.geographic_scopes parent
        join ancestors child on child.parent_id = parent.id
      )
      select 1
      from public.geographic_scope_memberships m
      join rbac.role_permission_grants rp on rp.role_id = m.role_id
      join ancestors a on a.id = m.geographic_scope_id
      where m.user_id = actor_id and m.status = 'active'
        and rp.permission_key = _permission_key
    )
  );
end
$$;

create or replace function rbac.can_assign_role(
  _role_id uuid,
  _reseller_id uuid default null,
  _organization_id uuid default null,
  _team_id uuid default null,
  _geographic_scope_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and rbac.has_permission(
      'members.manage', _reseller_id, _organization_id, _team_id, _geographic_scope_id
    )
    and exists (
      select 1
      from rbac.role_definitions target
      where target.id = _role_id
        and not exists (
          select 1
          from rbac.role_permission_grants grant_row
          where grant_row.role_id = target.id
            and not rbac.has_permission(
              grant_row.permission_key,
              _reseller_id,
              _organization_id,
              _team_id,
              _geographic_scope_id
            )
        )
    )
$$;

create or replace function rbac.validate_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_scope text;
  target_reseller_id uuid;
  target_organization_id uuid;
  target_team_id uuid;
  target_geographic_scope_id uuid;
begin
  if tg_table_name = 'platform_admin_memberships' then
    expected_scope := 'platform';
  elsif tg_table_name = 'tenant_reseller_memberships' then
    expected_scope := 'reseller';
    target_reseller_id := new.reseller_id;
  elsif tg_table_name = 'organization_memberships' then
    expected_scope := 'organization';
    target_organization_id := new.organization_id;
  elsif tg_table_name = 'team_memberships' then
    expected_scope := 'team';
    target_team_id := new.team_id;
  elsif tg_table_name = 'geographic_scope_memberships' then
    expected_scope := 'geography';
    target_geographic_scope_id := new.geographic_scope_id;
  else
    raise exception 'Unsupported membership table: %', tg_table_name;
  end if;

  if not exists (
    select 1 from rbac.role_definitions r
    where r.id = new.role_id and r.scope_type = expected_scope
  ) then
    raise exception 'Role scope does not match membership scope';
  end if;

  if auth.uid() is not null and (
    not rbac.has_permission(
      'rbac.roles.assign',
      target_reseller_id,
      target_organization_id,
      target_team_id,
      target_geographic_scope_id
    )
    or not rbac.can_assign_role(
      new.role_id,
      target_reseller_id,
      target_organization_id,
      target_team_id,
      target_geographic_scope_id
    )
  ) then
    raise exception 'Not authorized to assign this role in the requested scope'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$$;

create or replace function rbac.log_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership record;
  membership_user_id uuid;
  target_reseller_id uuid;
  target_organization_id uuid;
  target_team_id uuid;
  target_geographic_scope_id uuid;
  old_data jsonb;
  new_data jsonb;
begin
  if tg_op = 'DELETE' then
    membership := old;
  else
    membership := new;
  end if;

  membership_user_id := membership.user_id;
  if tg_table_name = 'tenant_reseller_memberships' then
    target_reseller_id := membership.reseller_id;
  elsif tg_table_name = 'organization_memberships' then
    target_organization_id := membership.organization_id;
    select o.reseller_id into target_reseller_id
    from public.organizations o where o.id = target_organization_id;
  elsif tg_table_name = 'team_memberships' then
    target_team_id := membership.team_id;
    select t.organization_id, o.reseller_id
      into target_organization_id, target_reseller_id
    from public.organization_teams t
    join public.organizations o on o.id = t.organization_id
    where t.id = target_team_id;
  elsif tg_table_name = 'geographic_scope_memberships' then
    target_geographic_scope_id := membership.geographic_scope_id;
    select g.organization_id, o.reseller_id
      into target_organization_id, target_reseller_id
    from public.geographic_scopes g
    join public.organizations o on o.id = g.organization_id
    where g.id = target_geographic_scope_id;
  end if;

  if tg_op <> 'INSERT' then
    old_data := jsonb_build_object('role_id', old.role_id, 'status', old.status);
  end if;
  if tg_op <> 'DELETE' then
    new_data := jsonb_build_object('role_id', new.role_id, 'status', new.status);
  end if;

  insert into public.audit_events (
    actor_user_id, subject_user_id, reseller_id, organization_id,
    team_id, geographic_scope_id, action, resource_type, resource_id,
    before_data, after_data
  ) values (
    auth.uid(), membership_user_id, target_reseller_id, target_organization_id,
    target_team_id, target_geographic_scope_id,
    lower(tg_table_name) || '.' || lower(tg_op), tg_table_name,
    membership_user_id::text, old_data, new_data
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create or replace function public.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit events are immutable'
    using errcode = 'insufficient_privilege';
end
$$;

create trigger platform_admin_memberships_role_guard
  before insert or update on public.platform_admin_memberships
  for each row execute function rbac.validate_membership_role();
create trigger reseller_memberships_role_guard
  before insert or update on public.tenant_reseller_memberships
  for each row execute function rbac.validate_membership_role();
create trigger organization_memberships_role_guard
  before insert or update on public.organization_memberships
  for each row execute function rbac.validate_membership_role();
create trigger team_memberships_role_guard
  before insert or update on public.team_memberships
  for each row execute function rbac.validate_membership_role();
create trigger geographic_scope_memberships_role_guard
  before insert or update on public.geographic_scope_memberships
  for each row execute function rbac.validate_membership_role();

create trigger reseller_memberships_audit
  after insert or update or delete on public.tenant_reseller_memberships
  for each row execute function rbac.log_membership_change();
create trigger organization_memberships_audit
  after insert or update or delete on public.organization_memberships
  for each row execute function rbac.log_membership_change();
create trigger team_memberships_audit
  after insert or update or delete on public.team_memberships
  for each row execute function rbac.log_membership_change();
create trigger geographic_scope_memberships_audit
  after insert or update or delete on public.geographic_scope_memberships
  for each row execute function rbac.log_membership_change();
create trigger platform_admin_memberships_audit
  after insert or update or delete on public.platform_admin_memberships
  for each row execute function rbac.log_membership_change();

create trigger audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function public.prevent_audit_event_mutation();

alter table public.resellers enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_teams enable row level security;
alter table public.geographic_scopes enable row level security;
alter table public.platform_admin_memberships enable row level security;
alter table public.tenant_reseller_memberships enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.team_memberships enable row level security;
alter table public.geographic_scope_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_events enable row level security;

grant select, insert, update, delete on
  public.resellers, public.organizations, public.organization_teams, public.geographic_scopes,
  public.platform_admin_memberships, public.tenant_reseller_memberships,
  public.organization_memberships, public.team_memberships,
  public.geographic_scope_memberships
to authenticated;
grant select on public.audit_events to authenticated;
grant all on
  public.resellers, public.organizations, public.organization_teams, public.geographic_scopes,
  public.platform_admin_memberships, public.tenant_reseller_memberships,
  public.organization_memberships, public.team_memberships,
  public.geographic_scope_memberships, public.invitations, public.audit_events
to service_role;
revoke all on public.invitations from public, anon, authenticated;
revoke truncate on public.audit_events from public, anon, authenticated, service_role;

revoke all on rbac.permission_catalog, rbac.role_definitions,
  rbac.role_permission_grants from public, anon, authenticated;
revoke all on function rbac.has_permission(text, uuid, uuid, uuid, uuid)
  from public, anon;
revoke all on function rbac.can_assign_role(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function rbac.validate_membership_role()
  from public, anon, authenticated;
revoke all on function rbac.log_membership_change()
  from public, anon, authenticated;
revoke all on function public.validate_invitation_scope()
  from public, anon, authenticated;
revoke all on function public.validate_geographic_scope_tree()
  from public, anon, authenticated;
revoke all on function public.prevent_audit_event_mutation()
  from public, anon, authenticated;
grant execute on function rbac.has_permission(text, uuid, uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function rbac.can_assign_role(uuid, uuid, uuid, uuid, uuid)
  to service_role;

create policy reseller_read_scoped on public.resellers
  for select to authenticated
  using (rbac.has_permission('resellers.read', id));
create policy reseller_insert_scoped on public.resellers
  for insert to authenticated
  with check (rbac.has_permission('platform.admin.manage'));
create policy reseller_update_scoped on public.resellers
  for update to authenticated
  using (rbac.has_permission('resellers.manage', id))
  with check (rbac.has_permission('resellers.manage', id));
create policy reseller_delete_scoped on public.resellers
  for delete to authenticated
  using (rbac.has_permission('resellers.manage', id));

create policy organization_read_scoped on public.organizations
  for select to authenticated
  using (rbac.has_permission('organizations.read', reseller_id, id));
create policy organization_insert_scoped on public.organizations
  for insert to authenticated
  with check (
    rbac.has_permission('organizations.manage', reseller_id)
    or rbac.has_permission('organizations.manage')
  );
create policy organization_update_scoped on public.organizations
  for update to authenticated
  using (rbac.has_permission('organizations.manage', reseller_id, id))
  with check (rbac.has_permission('organizations.manage', reseller_id, id));
create policy organization_delete_scoped on public.organizations
  for delete to authenticated
  using (rbac.has_permission('organizations.manage', reseller_id, id));

create policy organization_team_read_scoped on public.organization_teams
  for select to authenticated
  using (rbac.has_permission('teams.read', null, organization_id, id));
create policy organization_team_insert_scoped on public.organization_teams
  for insert to authenticated
  with check (rbac.has_permission('teams.manage', null, organization_id));
create policy organization_team_update_scoped on public.organization_teams
  for update to authenticated
  using (rbac.has_permission('teams.manage', null, organization_id, id))
  with check (rbac.has_permission('teams.manage', null, organization_id, id));
create policy organization_team_delete_scoped on public.organization_teams
  for delete to authenticated
  using (rbac.has_permission('teams.manage', null, organization_id, id));

create policy geographic_scope_read_scoped on public.geographic_scopes
  for select to authenticated
  using (rbac.has_permission('geographic_scopes.read', null, organization_id, null, id));
create policy geographic_scope_insert_scoped on public.geographic_scopes
  for insert to authenticated
  with check (
    rbac.has_permission('geographic_scopes.manage', null, organization_id, null, parent_id)
    or (parent_id is null and rbac.has_permission(
      'geographic_scopes.manage', null, organization_id
    ))
  );
create policy geographic_scope_update_scoped on public.geographic_scopes
  for update to authenticated
  using (rbac.has_permission('geographic_scopes.manage', null, organization_id, null, id))
  with check (rbac.has_permission('geographic_scopes.manage', null, organization_id, null, id));
create policy geographic_scope_delete_scoped on public.geographic_scopes
  for delete to authenticated
  using (rbac.has_permission('geographic_scopes.manage', null, organization_id, null, id));

create policy platform_admin_membership_read_self on public.platform_admin_memberships
  for select to authenticated
  using (user_id = auth.uid() or rbac.has_permission('platform.admin.manage'));
create policy platform_admin_membership_insert_admin on public.platform_admin_memberships
  for insert to authenticated
  with check (rbac.has_permission('platform.admin.manage'));
create policy platform_admin_membership_update_admin on public.platform_admin_memberships
  for update to authenticated
  using (rbac.has_permission('platform.admin.manage'))
  with check (rbac.has_permission('platform.admin.manage'));
create policy platform_admin_membership_delete_admin on public.platform_admin_memberships
  for delete to authenticated
  using (rbac.has_permission('platform.admin.manage'));

create policy tenant_reseller_membership_read_scoped on public.tenant_reseller_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or rbac.has_permission('members.read', reseller_id)
  );
create policy tenant_reseller_membership_insert_scoped on public.tenant_reseller_memberships
  for insert to authenticated
  with check (
    rbac.has_permission('members.manage', reseller_id)
    and rbac.has_permission('rbac.roles.assign', reseller_id)
  );
create policy tenant_reseller_membership_update_scoped on public.tenant_reseller_memberships
  for update to authenticated
  using (rbac.has_permission('members.manage', reseller_id))
  with check (
    rbac.has_permission('members.manage', reseller_id)
    and rbac.has_permission('rbac.roles.assign', reseller_id)
  );
create policy tenant_reseller_membership_delete_scoped on public.tenant_reseller_memberships
  for delete to authenticated
  using (rbac.has_permission('members.manage', reseller_id));

create policy organization_membership_read_scoped on public.organization_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or rbac.has_permission('members.read', null, organization_id)
  );
create policy organization_membership_insert_scoped on public.organization_memberships
  for insert to authenticated
  with check (
    rbac.has_permission('members.manage', null, organization_id)
    and rbac.has_permission('rbac.roles.assign', null, organization_id)
  );
create policy organization_membership_update_scoped on public.organization_memberships
  for update to authenticated
  using (rbac.has_permission('members.manage', null, organization_id))
  with check (
    rbac.has_permission('members.manage', null, organization_id)
    and rbac.has_permission('rbac.roles.assign', null, organization_id)
  );
create policy organization_membership_delete_scoped on public.organization_memberships
  for delete to authenticated
  using (rbac.has_permission('members.manage', null, organization_id));

create policy team_membership_read_scoped on public.team_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or rbac.has_permission('members.read', null, null, team_id)
  );
create policy team_membership_insert_scoped on public.team_memberships
  for insert to authenticated
  with check (
    rbac.has_permission('members.manage', null, null, team_id)
    and rbac.has_permission('rbac.roles.assign', null, null, team_id)
  );
create policy team_membership_update_scoped on public.team_memberships
  for update to authenticated
  using (rbac.has_permission('members.manage', null, null, team_id))
  with check (
    rbac.has_permission('members.manage', null, null, team_id)
    and rbac.has_permission('rbac.roles.assign', null, null, team_id)
  );
create policy team_membership_delete_scoped on public.team_memberships
  for delete to authenticated
  using (rbac.has_permission('members.manage', null, null, team_id));

create policy geographic_membership_read_scoped on public.geographic_scope_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or rbac.has_permission(
      'members.read', null, null, null, geographic_scope_id
    )
  );
create policy geographic_membership_insert_scoped on public.geographic_scope_memberships
  for insert to authenticated
  with check (
    rbac.has_permission(
      'members.manage', null, null, null, geographic_scope_id
    )
    and rbac.has_permission(
      'rbac.roles.assign', null, null, null, geographic_scope_id
    )
  );
create policy geographic_membership_update_scoped on public.geographic_scope_memberships
  for update to authenticated
  using (rbac.has_permission(
    'members.manage', null, null, null, geographic_scope_id
  ))
  with check (
    rbac.has_permission(
      'members.manage', null, null, null, geographic_scope_id
    )
    and rbac.has_permission(
      'rbac.roles.assign', null, null, null, geographic_scope_id
    )
  );
create policy geographic_membership_delete_scoped on public.geographic_scope_memberships
  for delete to authenticated
  using (rbac.has_permission(
    'members.manage', null, null, null, geographic_scope_id
  ));

create policy audit_event_read_scoped on public.audit_events
  for select to authenticated
  using (
    rbac.has_permission(
      'audit_events.read', reseller_id, organization_id, team_id, geographic_scope_id
    )
  );

revoke all on public.audit_events from public, anon, authenticated;
grant select on public.audit_events to authenticated;

commit;
