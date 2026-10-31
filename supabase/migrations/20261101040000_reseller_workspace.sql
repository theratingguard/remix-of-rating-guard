begin;

alter table public.teams
  alter column manager_id drop not null,
  add column reseller_id uuid references public.reseller_profiles(user_id) on delete cascade,
  add constraint teams_single_owner_check
    check ((manager_id is null) <> (reseller_id is null));

create index teams_reseller_active_idx
  on public.teams (reseller_id, created_at desc)
  where reseller_id is not null and is_active;

create table public.reseller_businesses (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.reseller_profiles(user_id) on delete cascade,
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  owner_name text not null check (length(trim(owner_name)) between 1 and 120),
  owner_email text not null check (length(trim(owner_email)) between 3 and 320),
  owner_mobile text not null check (length(trim(owner_mobile)) between 6 and 32),
  team_leader_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reseller_businesses_owner_created_idx
  on public.reseller_businesses (reseller_id, created_at desc);
create index reseller_businesses_team_leader_idx
  on public.reseller_businesses (team_leader_id, created_at desc)
  where team_leader_id is not null;

alter table public.reseller_businesses enable row level security;
revoke all on public.reseller_businesses from public, anon, authenticated;
grant select on public.reseller_businesses to authenticated;
grant all on public.reseller_businesses to service_role;

create policy reseller_businesses_owner_read on public.reseller_businesses
  for select to authenticated using (
    reseller_id = auth.uid() or public.report_access_level() = 'super_admin'
  );

create policy teams_reseller_owner_read on public.teams
  for select to authenticated using (reseller_id = auth.uid());

create or replace function public.reseller_wallet_summary()
returns table(
  total_earned_cents bigint,
  available_cents bigint,
  pending_commission_cents bigint,
  pending_payout_cents bigint,
  paid_payout_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or auth.jwt()->'app_metadata'->>'role' <> 'reseller' then
    raise exception 'Reseller access required';
  end if;

  return query
    select
      coalesce(sum(c.amount_cents) filter (
        where c.review_removal_order_id is not null and c.status <> 'rejected'
      ), 0)::bigint,
      coalesce(sum(c.amount_cents) filter (where c.status = 'available'), 0)::bigint,
      coalesce(sum(c.amount_cents) filter (where c.status = 'pending'), 0)::bigint,
      coalesce((
        select sum(p.amount_cents)
        from public.payout_requests p
        where p.reseller_id = actor and p.status in ('requested', 'approved')
      ), 0)::bigint,
      coalesce((
        select sum(p.amount_cents)
        from public.payout_requests p
        where p.reseller_id = actor and p.status = 'paid'
      ), 0)::bigint
    from public.reseller_commissions c
    where c.reseller_id = actor;
end
$$;

revoke all on function public.reseller_wallet_summary() from public, anon;
grant execute on function public.reseller_wallet_summary() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
