begin;

create table public.client_leads (
  id uuid primary key default gen_random_uuid(),
  review_url text not null unique,
  client_name text not null check (length(trim(client_name)) between 1 and 160),
  client_mobile text not null check (length(trim(client_mobile)) between 6 and 32),
  submitted_by_staff_id uuid not null references auth.users(id) on delete restrict,
  team_leader_name text,
  submitted_at timestamptz not null default now()
);

create index client_leads_submitted_at_idx
  on public.client_leads (submitted_at desc);

alter table public.client_leads enable row level security;
revoke all on public.client_leads from public, anon, authenticated;
grant select on public.client_leads to authenticated;
grant all on public.client_leads to service_role;

create policy client_leads_read_own_or_admin on public.client_leads
  for select to authenticated
  using (
    submitted_by_staff_id = (select auth.uid())
    or public.report_access_level() = 'super_admin'
  );

alter table public.scans
  add column client_lead_id uuid references public.client_leads(id) on delete set null,
  add column client_name text,
  add column client_mobile text,
  add column team_leader_name text;

notify pgrst, 'reload schema';
commit;
