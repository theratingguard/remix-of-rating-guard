begin;

create table public.seo_worker_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  tasks_completed integer not null default 0 check (tasks_completed between 0 and 20),
  audit_pages integer not null default 0 check (audit_pages between 0 and 20),
  issue_count integer not null default 0 check (issue_count between 0 and 500),
  error text,
  created_at timestamptz not null default now()
);

create unique index seo_worker_one_active_run_idx
  on public.seo_worker_runs ((status))
  where status = 'running';
create index seo_worker_runs_started_at_idx on public.seo_worker_runs (started_at desc);

create table public.seo_audit_issues (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.seo_worker_runs(id) on delete cascade,
  page_url text not null,
  issue_type text not null check (
    issue_type in ('page_unreachable', 'missing_title', 'missing_description', 'broken_link')
  ),
  severity text not null check (severity in ('low', 'medium', 'high')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  created_at timestamptz not null default now()
);
create index seo_audit_issues_status_created_idx on public.seo_audit_issues (status, created_at desc);
create index seo_audit_issues_run_id_idx on public.seo_audit_issues (run_id);

create table public.seo_content_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  target_keyword text not null check (char_length(target_keyword) between 1 and 160),
  outline jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index seo_content_drafts_status_created_idx
  on public.seo_content_drafts (status, created_at desc);

create table public.seo_meta_suggestions (
  id uuid primary key default gen_random_uuid(),
  page_url text not null,
  current_title text,
  proposed_title text not null check (char_length(proposed_title) between 1 and 180),
  current_description text,
  proposed_description text not null check (char_length(proposed_description) between 1 and 320),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index seo_meta_suggestions_status_created_idx
  on public.seo_meta_suggestions (status, created_at desc);

create table public.seo_link_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  target_url text not null,
  anchor_text text not null check (char_length(anchor_text) between 1 and 120),
  rationale text not null check (char_length(rationale) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_url, target_url, anchor_text)
);
create index seo_link_suggestions_status_created_idx
  on public.seo_link_suggestions (status, created_at desc);

create table public.seo_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('openstreetmap', 'google_places')),
  source_id text not null,
  business_name text not null,
  rating numeric(2,1) check (rating between 0 and 5),
  review_count integer check (review_count >= 0),
  category text,
  address text,
  website_url text,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);
create index seo_leads_created_at_idx on public.seo_leads (created_at desc);

create table public.seo_search_keywords (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('search_console', 'manual')),
  query text not null,
  page_url text,
  clicks integer check (clicks >= 0),
  impressions integer check (impressions >= 0),
  ctr numeric(6,5) check (ctr between 0 and 1),
  average_position numeric(7,2) check (average_position >= 0),
  collected_at timestamptz not null default now()
);
create index seo_search_keywords_source_collected_idx
  on public.seo_search_keywords (source, collected_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'seo_worker_runs',
    'seo_audit_issues',
    'seo_content_drafts',
    'seo_meta_suggestions',
    'seo_link_suggestions',
    'seo_leads',
    'seo_search_keywords'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.report_access_level() = ''super_admin'') with check (public.report_access_level() = ''super_admin'')',
      table_name || '_admin_only',
      table_name
    );
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
  end loop;
end
$$;

notify pgrst, 'reload schema';
commit;
