begin;

create table public.review_location_pages (
  id uuid primary key default gen_random_uuid(),
  country_slug text not null check (country_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  city_slug text not null check (city_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  country_name text not null check (length(trim(country_name)) between 2 and 100),
  city_name text not null check (length(trim(city_name)) between 2 and 120),
  locale text not null check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  description text not null check (length(trim(description)) between 50 and 160),
  page_content jsonb not null check (jsonb_typeof(page_content) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (country_slug, city_slug),
  check (status <> 'published' or published_at is not null)
);

create index review_location_pages_published_idx
  on public.review_location_pages (country_slug, city_slug)
  where status = 'published';

alter table public.review_location_pages enable row level security;
revoke all on public.review_location_pages from public, anon, authenticated;
grant select on public.review_location_pages to anon, authenticated;
grant all on public.review_location_pages to service_role;

create policy review_location_pages_read_published on public.review_location_pages
  for select to anon, authenticated
  using (status = 'published' and published_at <= now());

notify pgrst, 'reload schema';
commit;
