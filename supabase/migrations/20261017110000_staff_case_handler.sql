begin;

create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  mobile text not null check (length(trim(mobile)) between 6 and 32),
  email text not null check (length(trim(email)) between 3 and 320),
  region_city text not null check (length(trim(region_city)) between 1 and 120),
  region_state text not null check (length(trim(region_state)) between 1 and 120),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_mobile_unique on public.staff (mobile);
create index staff_status_region_idx on public.staff (status, lower(region_state), lower(region_city));
create index staff_last_seen_idx on public.staff (last_seen_at desc);

create table public.staff_cases (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null references auth.users(id),
  staff_id uuid not null references public.staff(id),
  scan_id uuid not null,
  review_id uuid not null,
  review_url text not null check (
    review_url ~ '^https://(www\.)?(google\.[a-z.]+|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|g\.page)/'
  ),
  business_name text not null,
  business_region text not null default '',
  review_text text not null default '',
  report_text text not null default '',
  evidence_notes text not null default '',
  policy_angle text not null default '',
  status text not null default 'open'
    check (status in ('open', 'submitted', 'reply_received', 'closed')),
  google_reply text,
  ai_status text check (ai_status is null or ai_status in ('removed', 'rejected', 'pending', 'need_evidence')),
  ai_next_step text,
  suggested_angle text,
  created_at timestamptz not null default now(),
  assigned_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (scan_id, client_user_id) references public.scans(id, user_id),
  foreign key (review_id, scan_id) references public.reviews(id, scan_id)
);
create unique index staff_cases_scan_review_unique on public.staff_cases (scan_id, review_id);
create index staff_cases_staff_status_idx on public.staff_cases (staff_id, status, assigned_at desc);
create index staff_cases_client_idx on public.staff_cases (client_user_id, created_at desc);
create index staff_cases_scan_idx on public.staff_cases (scan_id);
create index staff_cases_closed_at_idx on public.staff_cases (closed_at desc) where closed_at is not null;

create table public.staff_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.staff_cases(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  event_type text not null check (
    event_type in (
      'client_reported',
      'case_assigned',
      'report_prepared',
      'submission_recorded',
      'reply_received',
      'reply_analyzed',
      'next_action_taken',
      'case_closed'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index staff_case_events_timeline_idx on public.staff_case_events (case_id, created_at, id);
create index staff_case_events_staff_rate_idx
  on public.staff_case_events (actor_user_id, event_type, created_at desc);

alter table public.staff enable row level security;
alter table public.staff_cases enable row level security;
alter table public.staff_case_events enable row level security;

revoke all on public.staff, public.staff_cases, public.staff_case_events from public, anon, authenticated;
grant select on public.staff, public.staff_cases, public.staff_case_events to authenticated;
grant all on public.staff, public.staff_cases, public.staff_case_events to service_role;

create policy staff_profile_read on public.staff
  for select to authenticated
  using (id = auth.uid() or public.report_access_level() = 'super_admin');
create policy staff_case_read on public.staff_cases
  for select to authenticated
  using (
    client_user_id = auth.uid()
    or staff_id = auth.uid()
    or public.report_access_level() = 'super_admin'
  );
create policy staff_case_event_read on public.staff_case_events
  for select to authenticated
  using (
    public.report_access_level() = 'super_admin'
    or exists (
      select 1 from public.staff_cases c
      where c.id = case_id and (c.client_user_id = auth.uid() or c.staff_id = auth.uid())
    )
  );

notify pgrst, 'reload schema';
commit;
