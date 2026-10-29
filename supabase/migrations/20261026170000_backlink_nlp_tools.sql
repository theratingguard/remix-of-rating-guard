begin;

create table public.backlink_targets (
  id uuid primary key default gen_random_uuid(),
  competitor_url text not null check (char_length(competitor_url) between 8 and 2048),
  referring_page_url text not null check (char_length(referring_page_url) between 8 and 2048),
  target_domain text not null check (char_length(target_domain) between 1 and 253),
  source_type text not null default 'other'
    check (source_type in ('editorial', 'guest_post', 'forum', 'directory', 'other')),
  anchor_text text,
  contact_email text,
  notes text,
  outreach_subject text,
  outreach_body text,
  outreach_status text not null default 'not_generated'
    check (outreach_status in ('not_generated', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competitor_url, referring_page_url)
);

create index backlink_targets_created_idx on public.backlink_targets (created_at desc);

create table public.nlp_content_analyses (
  id uuid primary key default gen_random_uuid(),
  target_query text not null check (char_length(target_query) between 2 and 180),
  article_text text not null check (char_length(article_text) between 100 and 30000),
  reference_excerpts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reference_excerpts) = 'array'),
  extracted_entities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(extracted_entities) = 'array'),
  missing_topics jsonb not null default '[]'::jsonb
    check (jsonb_typeof(missing_topics) = 'array'),
  semantic_score integer not null check (semantic_score between 0 and 100),
  created_at timestamptz not null default now()
);

create index nlp_content_analyses_created_idx on public.nlp_content_analyses (created_at desc);

alter table public.backlink_targets enable row level security;
alter table public.nlp_content_analyses enable row level security;

create policy backlink_targets_super_admin on public.backlink_targets
  for all to authenticated
  using (public.report_access_level() = 'super_admin')
  with check (public.report_access_level() = 'super_admin');
create policy nlp_content_analyses_super_admin on public.nlp_content_analyses
  for all to authenticated
  using (public.report_access_level() = 'super_admin')
  with check (public.report_access_level() = 'super_admin');

grant select, insert, update, delete on public.backlink_targets to authenticated;
grant select, insert, update, delete on public.nlp_content_analyses to authenticated;
grant all on public.backlink_targets to service_role;
grant all on public.nlp_content_analyses to service_role;

notify pgrst, 'reload schema';
commit;
