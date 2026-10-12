begin;

create table public.review_evidence (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  screenshot_url text,
  review_url text,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (review_id, content_hash),
  check (review_url is null or review_url ~ '^https://([a-z0-9-]+\.)*google\.[a-z.]+/maps/'),
  check (screenshot_url is null or screenshot_url ~ '^https://')
);

create index review_evidence_review_captured_idx
  on public.review_evidence (review_id, captured_at desc);

alter table public.review_evidence enable row level security;
revoke all on public.review_evidence from public, anon, authenticated;
grant select, insert, update on public.review_evidence to authenticated;
grant all on public.review_evidence to service_role;

create policy review_evidence_owner_access on public.review_evidence
  for all to authenticated
  using (
    public.report_access_level() = 'super_admin'
    or exists (
      select 1 from public.reviews r
      join public.scans s on s.id = r.scan_id
      where r.id = review_evidence.review_id and s.user_id = auth.uid()
    )
  )
  with check (
    public.report_access_level() = 'super_admin'
    or exists (
      select 1 from public.reviews r
      join public.scans s on s.id = r.scan_id
      where r.id = review_evidence.review_id and s.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
commit;
