begin;

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 10 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  content text not null check (length(trim(content)) >= 1000),
  meta_description text not null check (length(trim(meta_description)) between 50 and 160),
  published_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create index blog_posts_published_idx
  on public.blog_posts (published_at desc, slug)
  where status = 'published';

alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from public, anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant all on public.blog_posts to service_role;

create policy blog_posts_read_published on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and published_at <= now());

notify pgrst, 'reload schema';
commit;
