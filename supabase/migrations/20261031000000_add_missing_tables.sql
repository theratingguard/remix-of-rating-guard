begin;

-- Code-to-migration inventory found no missing application tables. The only
-- non-table .from() targets are the "avatars" and "evidence" Storage buckets;
-- removal_history is an existing view. Keep this migration additive and safe
-- to apply after the existing schema migrations.

create table if not exists public.country_hashtags (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  hashtag text not null check (hashtag ~ '^#[A-Za-z][A-Za-z0-9]{1,31}$'),
  created_at timestamptz not null default now(),
  unique (country_code, hashtag)
);

alter table public.country_hashtags
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists country_code text,
  add column if not exists hashtag text,
  add column if not exists created_at timestamptz default now();

alter table public.country_hashtags enable row level security;
revoke all on public.country_hashtags from public, anon, authenticated;
grant select on public.country_hashtags to anon, authenticated;
grant all on public.country_hashtags to service_role;

drop policy if exists country_hashtags_read on public.country_hashtags;
create policy country_hashtags_read on public.country_hashtags
  for select to anon, authenticated
  using (true);

-- These fields were introduced by the SEO keyword-engine migration. Reassert
-- them here for databases where that migration was only partially applied.
alter table public.seo_keywords
  add column if not exists country text not null default '',
  add column if not exists search_volume integer,
  add column if not exists difficulty numeric(5, 2),
  add column if not exists cpc numeric(10, 2),
  add column if not exists intent text not null default 'informational';

do $$
declare
  missing_relations text;
begin
  select string_agg(required.name, ', ' order by required.name)
    into missing_relations
  from unnest(array[
    'ai_layer_usage',
    'ai_model_status',
    'app_settings',
    'appeal_tracking',
    'audit_log',
    'auto_replies',
    'auto_reply_preferences',
    'backlink_targets',
    'blog_posts',
    'businesses',
    'case_memory',
    'client_leads',
    'communication_evidence',
    'communication_log',
    'country_hashtags',
    'debug_findings',
    'error_events',
    'internal_chat_presence',
    'internal_chat_settings',
    'internal_message_audit',
    'internal_messages',
    'investigator_case_events',
    'investigator_cases',
    'investigators',
    'learning_snapshots',
    'nlp_content_analyses',
    'payout_requests',
    'place_cache',
    'profiles',
    'removal_outcomes',
    'reports',
    'reseller_commissions',
    'reseller_memberships',
    'reseller_plans',
    'reseller_profiles',
    'review_actions',
    'review_analyses',
    'review_evidence',
    'review_location_pages',
    'review_removal_orders',
    'reviews',
    'scan_batches',
    'scan_events',
    'scan_jobs',
    'scans',
    'seo_api_keys',
    'seo_audit_issues',
    'seo_content_drafts',
    'seo_keywords',
    'seo_leads',
    'seo_link_suggestions',
    'seo_meta_suggestions',
    'seo_worker_runs',
    'service_checks',
    'site_content',
    'staff',
    'staff_activity_log',
    'staff_admin_messages',
    'staff_case_earnings',
    'staff_case_events',
    'staff_cases',
    'staff_credits',
    'staff_payout_details',
    'staff_quality_notes',
    'staff_wallet_ledger',
    'submission_notifications',
    'submission_status',
    'system_state',
    'tasks',
    'team_task_earnings',
    'teams',
    'worker_logs',
    'worker_tasks'
  ]) as required(name)
  where to_regclass(format('public.%I', required.name)) is null;

  if missing_relations is not null then
    raise exception 'Required application tables are missing; apply their source migrations first: %',
      missing_relations;
  end if;

  if to_regclass('public.removal_history') is null then
    raise exception 'Required public.removal_history view is missing; apply the phase-one insights migration.';
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
