begin;

create table if not exists public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null check (length(trim(keyword)) between 3 and 240),
  country text not null default '',
  search_volume integer check (search_volume is null or search_volume >= 0),
  difficulty numeric(5, 2)
    check (difficulty is null or difficulty between 0 and 100),
  cpc numeric(10, 2) check (cpc is null or cpc >= 0),
  intent text not null default 'informational'
    check (intent in ('informational', 'navigational', 'commercial', 'transactional')),
  locale text not null check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  location text not null default '',
  service text not null default '',
  industry text not null default '',
  source text not null default 'template'
    check (source in ('template', 'google_suggest', 'template+google_suggest')),
  related_keywords text[] not null default '{}',
  entities jsonb not null default '[]'::jsonb,
  title text not null check (length(trim(title)) between 10 and 180),
  description text not null check (length(trim(description)) between 50 and 160),
  hashtags text[] not null default '{}',
  translation_group text,
  page_content jsonb check (
    page_content is null or jsonb_typeof(page_content) = 'object'
  ),
  status text not null default 'draft'
    check (status in ('pending', 'draft', 'published', 'archived')),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (locale, keyword),
  unique (locale, slug),
  check (status <> 'published' or published_at is not null)
);

create index if not exists seo_keywords_published_locale_idx
  on public.seo_keywords (locale, slug)
  where status = 'published';
create index if not exists seo_keywords_published_group_idx
  on public.seo_keywords (translation_group)
  where status = 'published' and translation_group is not null;
create index if not exists seo_keywords_pending_country_idx
  on public.seo_keywords (country, created_at desc)
  where status = 'pending';
create index if not exists seo_keywords_search_volume_idx
  on public.seo_keywords (search_volume desc nulls last, created_at desc)
  where status = 'published' and page_content is not null;

alter table public.seo_keywords enable row level security;
revoke all on public.seo_keywords from public, anon, authenticated;
grant select on public.seo_keywords to anon, authenticated;
grant all on public.seo_keywords to service_role;

drop policy if exists seo_keywords_read_published on public.seo_keywords;
create policy seo_keywords_read_published on public.seo_keywords
  for select to anon, authenticated
  using (status = 'published' and page_content is not null);

notify pgrst, 'reload schema';
commit;
