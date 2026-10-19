begin;

create table public.reseller_plans (
  id text primary key check (id in ('starter', 'professional', 'enterprise')),
  name text not null,
  annual_fee_cents integer not null check (annual_fee_cents >= 0),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.reseller_plans (id, name, annual_fee_cents, commission_bps)
values
  ('starter', 'STARTER', 9900, 3000),
  ('professional', 'PROFESSIONAL', 24900, 4000),
  ('enterprise', 'ENTERPRISE', 49900, 5000)
on conflict (id) do update set
  name = excluded.name,
  annual_fee_cents = excluded.annual_fee_cents,
  commission_bps = excluded.commission_bps,
  updated_at = now();

alter table public.reseller_profiles
  add column status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended'));
create index reseller_profiles_status_created_idx
  on public.reseller_profiles (status, created_at desc);

create table public.reseller_memberships (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.reseller_profiles(user_id),
  plan_id text not null references public.reseller_plans(id),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'expired', 'cancelled', 'rejected')),
  annual_fee_cents integer not null check (annual_fee_cents >= 0),
  payment_reference text,
  paid_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status <> 'active' or (paid_at is not null and starts_at is not null and ends_at > starts_at))
  )
);
create unique index reseller_membership_one_active_idx
  on public.reseller_memberships (reseller_id) where status = 'active';
create index reseller_membership_owner_created_idx
  on public.reseller_memberships (reseller_id, created_at desc);

alter table public.reseller_commissions
  drop constraint if exists reseller_commissions_referred_user_id_key;
alter table public.reseller_commissions
  add column review_removal_order_id uuid,
  add column amount_cents integer not null default 0 check (amount_cents >= 0),
  add column commission_bps integer not null default 0 check (commission_bps between 0 and 10000),
  add column hold_until timestamptz,
  add column payout_request_id uuid;
alter table public.reseller_commissions
  drop constraint if exists reseller_commissions_status_check;
alter table public.reseller_commissions
  add constraint reseller_commissions_status_check
    check (status in ('pending', 'approved', 'paid', 'rejected', 'available', 'payout_requested'));

create table public.review_removal_orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id),
  reseller_id uuid references public.reseller_profiles(user_id),
  scan_id uuid not null references public.scans(id),
  review_id uuid not null references public.reviews(id),
  price_cents integer not null default 4900 check (price_cents = 4900),
  status text not null default 'requested'
    check (status in ('requested', 'evidence_prepared', 'submitted_to_google', 'removed_verified', 'not_removed', 'payment_due', 'paid')),
  google_reference text,
  google_decision_at timestamptz,
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id),
  foreign key (review_id, scan_id) references public.reviews(id, scan_id),
  check (
    (status not in ('submitted_to_google', 'removed_verified', 'not_removed', 'payment_due', 'paid')
      or (google_reference is not null and length(trim(google_reference)) >= 8))
    and (status not in ('payment_due', 'paid') or google_decision_at is not null)
    and
    (status <> 'paid' or (paid_at is not null and payment_reference is not null))
  )
);
create index review_removal_orders_client_created_idx
  on public.review_removal_orders (client_id, created_at desc);
create index review_removal_orders_status_created_idx
  on public.review_removal_orders (status, created_at desc);
create unique index reseller_commissions_order_unique_idx
  on public.reseller_commissions (review_removal_order_id)
  where review_removal_order_id is not null;
create unique index reseller_commissions_referral_unique_idx
  on public.reseller_commissions (referred_user_id)
  where review_removal_order_id is null;
create index reseller_commissions_available_idx
  on public.reseller_commissions (reseller_id, status, hold_until);

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.reseller_profiles(user_id),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'paid')),
  reviewed_by uuid references auth.users(id),
  payment_reference text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'paid' or (paid_at is not null and payment_reference is not null))
);
create unique index payout_requests_payment_reference_unique_idx
  on public.payout_requests (payment_reference)
  where payment_reference is not null;
create unique index reseller_memberships_payment_reference_unique_idx
  on public.reseller_memberships (payment_reference)
  where payment_reference is not null;
create unique index review_removal_orders_payment_reference_unique_idx
  on public.review_removal_orders (payment_reference)
  where payment_reference is not null;
alter table public.reseller_commissions
  add constraint reseller_commissions_order_fk
    foreign key (review_removal_order_id) references public.review_removal_orders(id),
  add constraint reseller_commissions_payout_fk
    foreign key (payout_request_id) references public.payout_requests(id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null check (length(trim(action)) between 1 and 120),
  entity_type text not null check (length(trim(entity_type)) between 1 and 80),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_created_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

alter table public.reseller_plans enable row level security;
alter table public.reseller_memberships enable row level security;
alter table public.reseller_commissions enable row level security;
alter table public.payout_requests enable row level security;
alter table public.review_removal_orders enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.reseller_plans, public.reseller_memberships, public.reseller_commissions,
  public.payout_requests, public.review_removal_orders, public.audit_logs from public, anon, authenticated;
grant select on public.reseller_plans to anon, authenticated;
grant select on public.reseller_memberships, public.reseller_commissions, public.payout_requests,
  public.review_removal_orders to authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.reseller_plans, public.reseller_memberships, public.reseller_commissions,
  public.payout_requests, public.review_removal_orders, public.audit_logs to service_role;

drop policy if exists reseller_commission_read on public.reseller_commissions;
drop policy if exists reseller_commission_super_admin_update on public.reseller_commissions;
drop policy if exists reseller_profile_read on public.reseller_profiles;
create policy reseller_plan_read_active on public.reseller_plans
  for select to authenticated using (is_active or public.report_access_level() = 'super_admin');
create policy reseller_plan_read_public on public.reseller_plans
  for select to anon using (is_active);
create policy reseller_membership_owner_or_admin_read on public.reseller_memberships
  for select to authenticated
  using (reseller_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy reseller_commission_owner_or_admin_read on public.reseller_commissions
  for select to authenticated
  using (reseller_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy payout_request_owner_or_admin_read on public.payout_requests
  for select to authenticated
  using (reseller_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy removal_order_owner_or_admin_read on public.review_removal_orders
  for select to authenticated
  using (client_id = auth.uid() or reseller_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy commerce_audit_admin_read on public.audit_logs
  for select to authenticated using (public.report_access_level() = 'super_admin');
create policy reseller_profile_read on public.reseller_profiles
  for select to authenticated using (user_id = auth.uid() or public.report_access_level() = 'super_admin');

create or replace function public.submit_review_removal_orders(_scan_id uuid, _review_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  linked_reseller uuid;
  review_id uuid;
  order_id uuid;
  submitted integer := 0;
begin
  if actor is null or auth.jwt()->'app_metadata'->>'role' <> 'client' then
    raise exception 'Client access required';
  end if;
  if coalesce(cardinality(_review_ids), 0) = 0 or cardinality(_review_ids) > 50 then
    raise exception 'Select between 1 and 50 reviews';
  end if;
  if (select count(distinct selected.review_id) from unnest(_review_ids) as selected(review_id))
      <> cardinality(_review_ids) then
    raise exception 'A review was selected more than once';
  end if;
  select c.reseller_id into linked_reseller
    from public.reseller_commissions c
    where c.referred_user_id = actor and c.review_removal_order_id is null
    order by c.created_at asc limit 1;
  foreach review_id in array _review_ids loop
    if not exists (
      select 1 from public.scans s
      join public.reviews r on r.scan_id = s.id
      where s.id = _scan_id and r.id = review_id
        and s.user_id = actor and s.status = 'complete' and not s.is_seed
    ) then
      raise exception 'Selected review is not part of your completed scan';
    end if;
    insert into public.review_removal_orders (client_id, reseller_id, scan_id, review_id)
      values (actor, linked_reseller, _scan_id, review_id)
      returning id into order_id;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id)
      values (actor, 'order_requested', 'review_removal_order', order_id);
    submitted := submitted + 1;
  end loop;
  return submitted;
exception when unique_violation then
  raise exception 'A removal request already exists for one of the selected reviews';
end;
$$;

create or replace function public.admin_update_review_removal_order(
  _order_id uuid, _status text, _google_reference text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  item public.review_removal_orders%rowtype;
  active_rate integer;
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if _status not in ('evidence_prepared', 'submitted_to_google', 'removed_verified', 'not_removed') then
    raise exception 'Unsupported order transition';
  end if;
  select * into item from public.review_removal_orders where id = _order_id for update;
  if not found then raise exception 'Removal order not found'; end if;
  if not (
    (item.status = 'requested' and _status = 'evidence_prepared')
    or (item.status = 'evidence_prepared' and _status = 'submitted_to_google')
    or (item.status = 'submitted_to_google' and _status in ('removed_verified', 'not_removed'))
  ) then
    raise exception 'Invalid removal-order state transition';
  end if;
  if _status in ('submitted_to_google', 'removed_verified', 'not_removed')
    and length(trim(coalesce(_google_reference, ''))) < 8 then
    raise exception 'A verifiable Google submission or decision reference is required';
  end if;
  if _status = 'removed_verified' and item.status not in ('submitted_to_google', 'removed_verified') then
    raise exception 'Only a submitted order can be marked removed';
  end if;
  if _status = 'not_removed' and item.status not in ('submitted_to_google', 'not_removed') then
    raise exception 'Only a submitted order can have a recorded Google decision';
  end if;
  update public.review_removal_orders
    set status = case when _status = 'removed_verified' then 'payment_due' else _status end,
        google_reference = coalesce(nullif(trim(_google_reference), ''), google_reference),
        google_decision_at = case when _status in ('removed_verified', 'not_removed') then now() else google_decision_at end,
        updated_at = now()
    where id = _order_id;
  if _status = 'removed_verified' and item.reseller_id is not null then
    select m.commission_bps into active_rate
      from public.reseller_memberships m
      join public.reseller_profiles rp on rp.user_id = m.reseller_id
      where m.reseller_id = item.reseller_id and m.status = 'active'
        and rp.status = 'approved' and m.ends_at > now()
      order by m.ends_at desc limit 1;
    if active_rate is not null then
      insert into public.reseller_commissions (
        reseller_id, referred_user_id, review_removal_order_id, amount_paise, amount_cents,
        commission_bps, hold_until, status
      ) values (
        item.reseller_id, item.client_id, item.id,
        0, floor(item.price_cents * active_rate / 10000.0)::integer,
        active_rate, now() + interval '14 days', 'pending'
      );
    end if;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (actor, 'order_' || _status, 'review_removal_order', _order_id,
      jsonb_build_object('google_reference', _google_reference));
  return _order_id;
end;
$$;

create or replace function public.admin_confirm_review_payment(
  _order_id uuid, _payment_reference text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if length(trim(coalesce(_payment_reference, ''))) < 8 then
    raise exception 'A confirmed payment reference is required';
  end if;
  if exists (
    select 1 from public.review_removal_orders
    where id = _order_id and google_reference = trim(_payment_reference)
  ) then
    raise exception 'Use the payment transaction reference, not the Google case reference';
  end if;
  update public.review_removal_orders
    set status = 'paid', payment_reference = trim(_payment_reference), paid_at = now(), updated_at = now()
    where id = _order_id and status = 'payment_due';
  if not found then raise exception 'Order is not due for payment or was already paid'; end if;
  update public.reseller_commissions
    set status = case when hold_until > now() then 'pending' else 'available' end, updated_at = now()
    where review_removal_order_id = _order_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (actor, 'payment_confirmed', 'review_removal_order', _order_id);
  return _order_id;
end;
$$;

create or replace function public.request_reseller_payout()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  total_cents bigint;
  request_id uuid;
begin
  if actor is null or auth.jwt()->'app_metadata'->>'role' <> 'reseller' then
    raise exception 'Reseller access required';
  end if;
  perform 1 from public.reseller_profiles
    where user_id = actor and status = 'approved' for update;
  if not found then raise exception 'Reseller account is not approved'; end if;
  update public.reseller_commissions set status = 'available', updated_at = now()
    where reseller_id = actor and status = 'pending' and hold_until <= now();
  select coalesce(sum(amount_cents), 0) into total_cents
    from public.reseller_commissions where reseller_id = actor and status = 'available';
  if total_cents <= 0 then raise exception 'No matured commission is available for payout'; end if;
  if total_cents > 2147483647 then raise exception 'Available commission exceeds the payout limit'; end if;
  insert into public.payout_requests (reseller_id, amount_cents)
    values (actor, total_cents::integer) returning id into request_id;
  update public.reseller_commissions set status = 'payout_requested',
    payout_request_id = request_id, updated_at = now()
    where reseller_id = actor and status = 'available';
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (actor, 'payout_requested', 'payout_request', request_id);
  return request_id;
end;
$$;

create or replace function public.admin_review_payout(
  _payout_id uuid, _decision text, _payment_reference text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  payout public.payout_requests%rowtype;
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if _decision not in ('approved', 'rejected', 'paid') then
    raise exception 'Unsupported payout decision';
  end if;
  select * into payout from public.payout_requests where id = _payout_id for update;
  if not found or payout.status not in ('requested', 'approved') then
    raise exception 'Payout request is not actionable';
  end if;
  if _decision = 'paid' and length(trim(coalesce(_payment_reference, ''))) < 8 then
    raise exception 'A confirmed payout reference is required';
  end if;
  if _decision = 'approved' and payout.status <> 'requested' then
    raise exception 'Only a requested payout can be approved';
  end if;
  if _decision = 'paid' and payout.status <> 'approved' then
    raise exception 'Only an approved payout can be marked paid';
  end if;
  update public.payout_requests set status = _decision, reviewed_by = actor,
    reviewed_at = now(),
    paid_at = case when _decision = 'paid' then now() else paid_at end,
    payment_reference = case when _decision = 'paid' then trim(_payment_reference) else payment_reference end,
    updated_at = now()
    where id = _payout_id;
  if _decision in ('rejected', 'paid') then
    update public.reseller_commissions
      set status = case when _decision = 'paid' then 'paid' else 'available' end,
          payout_request_id = null, updated_at = now()
      where payout_request_id = _payout_id;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (actor, 'payout_' || _decision, 'payout_request', _payout_id);
  return _payout_id;
end;
$$;

create or replace function public.admin_set_reseller_plan(
  _plan_id text, _annual_fee_cents integer, _commission_bps integer, _is_active boolean
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if _annual_fee_cents < 0 or _commission_bps not between 0 and 10000 then
    raise exception 'Invalid plan price or commission rate';
  end if;
  update public.reseller_plans set annual_fee_cents = _annual_fee_cents,
    commission_bps = _commission_bps, is_active = _is_active, updated_at = now()
    where id = _plan_id;
  if not found then raise exception 'Plan not found'; end if;
  insert into public.audit_logs (actor_id, action, entity_type, details)
    values (actor, 'plan_updated', 'reseller_plan',
      jsonb_build_object('plan_id', _plan_id, 'annual_fee_cents', _annual_fee_cents, 'commission_bps', _commission_bps));
  return _plan_id;
end;
$$;

create or replace function public.admin_review_reseller(
  _reseller_id uuid, _decision text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if _decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'Unsupported reseller decision';
  end if;
  update public.reseller_profiles set status = _decision, updated_at = now()
    where user_id = _reseller_id;
  if not found then raise exception 'Reseller profile not found'; end if;
  if _decision in ('rejected', 'suspended') then
    update public.reseller_memberships set status = 'rejected', updated_at = now()
      where reseller_id = _reseller_id and status = 'pending_payment';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (actor, 'reseller_' || _decision, 'reseller_profile', _reseller_id);
  return _reseller_id;
end;
$$;

create or replace function public.admin_activate_reseller_membership(
  _membership_id uuid, _payment_reference text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  membership public.reseller_memberships%rowtype;
begin
  if actor is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if length(trim(coalesce(_payment_reference, ''))) < 8 then
    raise exception 'A confirmed membership payment reference is required';
  end if;
  select * into membership from public.reseller_memberships
    where id = _membership_id for update;
  if not found or membership.status <> 'pending_payment' then
    raise exception 'Membership is not awaiting payment confirmation';
  end if;
  if not exists (
    select 1 from public.reseller_profiles
    where user_id = membership.reseller_id and status = 'approved'
  ) then
    raise exception 'Approve the reseller account before activating membership';
  end if;
  update public.reseller_memberships
    set status = 'active', payment_reference = trim(_payment_reference),
        paid_at = now(), starts_at = now(), ends_at = now() + interval '1 year',
        approved_by = actor, updated_at = now()
    where id = _membership_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (actor, 'membership_activated', 'reseller_membership', _membership_id);
  return _membership_id;
end;
$$;

create or replace function public.record_reseller_commerce_signup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  matching_reseller uuid;
  code text;
  selected_plan text;
  fee_cents integer;
  selected_commission_bps integer;
  account_type text := new.raw_user_meta_data->>'account_type';
begin
  if new.email_confirmed_at is null
    or (tg_op = 'UPDATE' and old.email_confirmed_at is not null) then
    return new;
  end if;
  if account_type = 'client' then
    code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
    if code <> '' then
      select user_id into matching_reseller
        from public.reseller_profiles where referral_code = code;
      if matching_reseller is null or matching_reseller = new.id then
        raise exception 'Invalid reseller referral code';
      end if;
      insert into public.reseller_commissions (reseller_id, referred_user_id)
        values (matching_reseller, new.id) on conflict do nothing;
    end if;
    update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"client"}'::jsonb
      where id = new.id;
  elsif account_type = 'reseller' then
    selected_plan := new.raw_user_meta_data->>'reseller_plan';
    select annual_fee_cents, commission_bps
      into fee_cents, selected_commission_bps
      from public.reseller_plans where id = selected_plan and is_active;
    if fee_cents is null then raise exception 'Select an active reseller plan'; end if;
    insert into public.reseller_profiles (user_id) values (new.id)
      on conflict (user_id) do nothing;
    insert into public.user_roles (user_id, role) values (new.id, 'reseller')
      on conflict (user_id, role) do nothing;
    insert into public.reseller_memberships (
      reseller_id, plan_id, annual_fee_cents, commission_bps
    ) values (
      new.id, selected_plan, fee_cents, selected_commission_bps
    );
    update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"reseller"}'::jsonb
      where id = new.id;
  end if;
  return new;
end
$$;
drop trigger if exists internal_chat_record_reseller_referral on auth.users;
create trigger internal_chat_record_reseller_commerce_signup
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.record_reseller_commerce_signup();
revoke all on function public.record_reseller_commerce_signup() from public, anon, authenticated;

revoke all on function public.submit_review_removal_orders(uuid, uuid[]) from public, anon;
revoke all on function public.admin_update_review_removal_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_confirm_review_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.request_reseller_payout() from public, anon;
revoke all on function public.admin_review_payout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_reseller_plan(text, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.admin_review_reseller(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_activate_reseller_membership(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_review_removal_orders(uuid, uuid[]) to authenticated;
grant execute on function public.admin_update_review_removal_order(uuid, text, text) to authenticated;
grant execute on function public.admin_confirm_review_payment(uuid, text) to authenticated;
grant execute on function public.request_reseller_payout() to authenticated;
grant execute on function public.admin_review_payout(uuid, text, text) to authenticated;
grant execute on function public.admin_set_reseller_plan(text, integer, integer, boolean) to authenticated;
grant execute on function public.admin_review_reseller(uuid, text) to authenticated;
grant execute on function public.admin_activate_reseller_membership(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
