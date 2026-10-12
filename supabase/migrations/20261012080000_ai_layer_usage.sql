begin;

create table public.ai_layer_usage (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.scans(id) on delete set null,
  review_id uuid references public.reviews(id) on delete set null,
  layer text not null check (layer in ('rules', 'ollama', 'gpt')),
  duration_ms integer not null check (duration_ms >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index ai_layer_usage_created_at_idx on public.ai_layer_usage(created_at);
create index ai_layer_usage_layer_created_at_idx on public.ai_layer_usage(layer, created_at);

alter table public.ai_layer_usage enable row level security;
revoke all on public.ai_layer_usage from anon, authenticated;
grant select on public.ai_layer_usage to authenticated;
grant all on public.ai_layer_usage to service_role;

create policy super_admin_ai_layer_usage_read on public.ai_layer_usage
  for select to authenticated
  using (public.report_access_level() = 'super_admin');

notify pgrst, 'reload schema';
commit;
