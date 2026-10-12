begin;
create table public.auto_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  scan_id uuid not null,
  user_id uuid not null references auth.users(id),
  reply_text text not null check (length(trim(reply_text)) between 1 and 4000),
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  tone text not null check (tone in ('professional','friendly','calm','apologetic','firm','short','detailed')),
  model text not null,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (review_id, scan_id) references public.reviews(id, scan_id) on delete cascade,
  foreign key (scan_id, user_id) references public.scans(id, user_id) on delete cascade
);
create index auto_replies_owner_review_created_idx
  on public.auto_replies(user_id, review_id, created_at desc);
alter table public.auto_replies enable row level security;
revoke all on public.auto_replies from anon, authenticated;
grant select, insert, update on public.auto_replies to authenticated;
grant all on public.auto_replies to service_role;
create policy auto_replies_owner_access on public.auto_replies for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke delete on public.auto_replies from authenticated;
commit;
