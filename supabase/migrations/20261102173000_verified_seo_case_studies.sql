begin;

create table if not exists public.seo_case_studies (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null check (length(trim(title)) between 10 and 180),
  organization_label text not null check (length(trim(organization_label)) between 2 and 120),
  summary text not null check (length(trim(summary)) between 100 and 3000),
  content text not null check (length(trim(content)) between 300 and 30000),
  evidence_reference text not null check (length(trim(evidence_reference)) between 1 and 500),
  consent_reference text not null check (length(trim(consent_reference)) between 1 and 500),
  consent_confirmed boolean not null default false,
  evidence_verified boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'published'
    or (
      consent_confirmed
      and evidence_verified
      and reviewed_by is not null
      and reviewed_at is not null
      and slug is not null
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  )
);

create index if not exists seo_case_studies_published_idx
  on public.seo_case_studies (updated_at desc, slug)
  where status = 'published' and consent_confirmed and evidence_verified;

alter table public.seo_case_studies enable row level security;
revoke all on public.seo_case_studies from public, anon, authenticated;
grant select on public.seo_case_studies to anon, authenticated;
grant insert, select, update, delete on public.seo_case_studies to authenticated;
grant all on public.seo_case_studies to service_role;

drop policy if exists seo_case_studies_public_read on public.seo_case_studies;
create policy seo_case_studies_public_read on public.seo_case_studies
  for select to anon, authenticated
  using (
    status = 'published'
    and consent_confirmed
    and evidence_verified
    and reviewed_by is not null
    and reviewed_at is not null
  );

drop policy if exists seo_case_studies_super_admin_manage on public.seo_case_studies;
create policy seo_case_studies_super_admin_manage on public.seo_case_studies
  for all to authenticated
  using (public.report_access_level() = 'super_admin')
  with check (public.report_access_level() = 'super_admin');

notify pgrst, 'reload schema';
commit;
