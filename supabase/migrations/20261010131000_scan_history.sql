begin;
create table if not exists public.scan_history (
  id uuid default gen_random_uuid() primary key,
  business_url text,
  total_reviews integer,
  flagged_reviews integer,
  report_url text,
  created_at timestamp default now()
);
alter table public.scan_history enable row level security;
revoke all on public.scan_history from anon, authenticated;
grant select, insert, update, delete on public.scan_history to service_role;
notify pgrst, 'reload schema';
commit;
