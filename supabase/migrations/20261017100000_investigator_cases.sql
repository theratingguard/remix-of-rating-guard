begin;

create table public.investigators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  mobile text not null check (length(trim(mobile)) between 6 and 32),
  email text not null check (length(trim(email)) between 3 and 320),
  city text not null check (length(trim(city)) between 1 and 120),
  state text not null check (length(trim(state)) between 1 and 120),
  pincode text not null check (length(trim(pincode)) between 3 and 20),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index investigators_mobile_unique on public.investigators (mobile);
create index investigators_status_city_idx on public.investigators (status, lower(city));
create index investigators_last_seen_idx on public.investigators (last_seen_at desc);

create table public.investigator_cases (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id),
  investigator_id uuid references public.investigators(user_id),
  scan_id uuid not null,
  review_id uuid not null,
  review_url text not null check (
    review_url ~ '^https://(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|g\.page)/'
  ),
  business_name text not null,
  business_city text,
  business_state text,
  review_text text not null default '',
  report_text text not null default '',
  evidence_notes text not null default '',
  policy_angle text not null default '',
  status text not null default 'assigned'
    check (status in ('assigned', 'pending', 'submitted', 'reviewed', 'closed')),
  google_reply text,
  ai_status text check (ai_status is null or ai_status in ('removed', 'rejected', 'pending', 'need_evidence')),
  ai_next_step text,
  created_at timestamptz not null default now(),
  assigned_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (scan_id, client_user_id) references public.scans(id, user_id),
  foreign key (review_id, scan_id) references public.reviews(id, scan_id)
);
create index investigator_cases_staff_status_idx
  on public.investigator_cases (investigator_id, status, assigned_at desc);
create index investigator_cases_client_idx
  on public.investigator_cases (client_user_id, created_at desc);
create index investigator_cases_scan_idx on public.investigator_cases (scan_id);
create unique index investigator_cases_scan_review_unique
  on public.investigator_cases (scan_id, review_id);

create table public.investigator_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.investigator_cases(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null check (
    event_type in ('client_url_received', 'case_assigned', 'report_prepared', 'submission_recorded', 'reply_received', 'reply_analyzed', 'case_closed')
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index investigator_case_events_timeline_idx
  on public.investigator_case_events (case_id, created_at, id);

alter table public.investigators enable row level security;
alter table public.investigator_cases enable row level security;
alter table public.investigator_case_events enable row level security;

revoke all on public.investigators, public.investigator_cases, public.investigator_case_events
  from public, anon, authenticated;
grant select on public.investigators, public.investigator_cases, public.investigator_case_events
  to authenticated;
grant all on public.investigators, public.investigator_cases, public.investigator_case_events
  to service_role;

create policy investigator_profile_read on public.investigators
  for select to authenticated
  using (user_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy investigator_case_read on public.investigator_cases
  for select to authenticated
  using (
    client_user_id = auth.uid()
    or investigator_id = auth.uid()
    or public.report_access_level() = 'super_admin'
  );
create policy investigator_case_event_read on public.investigator_case_events
  for select to authenticated
  using (
    public.report_access_level() = 'super_admin'
    or exists (
      select 1 from public.investigator_cases c
      where c.id = case_id and (c.client_user_id = auth.uid() or c.investigator_id = auth.uid())
    )
  );

notify pgrst, 'reload schema';
commit;
