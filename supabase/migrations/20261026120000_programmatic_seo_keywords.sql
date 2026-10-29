begin;

create table public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null check (length(trim(keyword)) between 3 and 240),
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
  page_content jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (locale, keyword),
  unique (locale, slug),
  check (status <> 'published' or published_at is not null),
  check (page_content is null or jsonb_typeof(page_content) = 'object')
);

create index seo_keywords_published_locale_idx
  on public.seo_keywords (locale, slug)
  where status = 'published';
create index seo_keywords_published_group_idx
  on public.seo_keywords (translation_group)
  where status = 'published' and translation_group is not null;

alter table public.seo_keywords enable row level security;
revoke all on public.seo_keywords from public, anon, authenticated;
grant select on public.seo_keywords to anon, authenticated;
grant all on public.seo_keywords to service_role;

create policy seo_keywords_read_published on public.seo_keywords
  for select to anon, authenticated
  using (
    status = 'published'
    and page_content is not null
  );

notify pgrst, 'reload schema';
commit;
