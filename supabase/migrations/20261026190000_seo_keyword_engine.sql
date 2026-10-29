begin;

alter table public.seo_keywords
  add column country text not null default '',
  add column search_volume integer,
  add column difficulty numeric(5, 2),
  add column cpc numeric(10, 2),
  add column intent text not null default 'informational';

update public.seo_keywords
set country = case locale
  when 'en-US' then 'United States'
  when 'en-GB' then 'United Kingdom'
  when 'es-ES' then 'Spain'
  when 'fr-FR' then 'France'
  when 'de-DE' then 'Germany'
  when 'ar-AE' then 'United Arab Emirates'
  when 'hi-IN' then 'India'
  when 'ja-JP' then 'Japan'
  when 'pt-BR' then 'Brazil'
  when 'en-CA' then 'Canada'
  when 'en-AU' then 'Australia'
  when 'it-IT' then 'Italy'
  when 'nl-NL' then 'Netherlands'
  when 'ko-KR' then 'South Korea'
  when 'zh-CN' then 'China'
  when 'tr-TR' then 'Turkey'
  when 'id-ID' then 'Indonesia'
  when 'sv-SE' then 'Sweden'
  when 'pl-PL' then 'Poland'
  when 'en-SG' then 'Singapore'
  else ''
end
where country = '';

alter table public.seo_keywords
  drop constraint if exists seo_keywords_status_check;
alter table public.seo_keywords
  add constraint seo_keywords_status_check
  check (status in ('pending', 'draft', 'published', 'archived'));
alter table public.seo_keywords
  add constraint seo_keywords_search_volume_check
    check (search_volume is null or search_volume >= 0),
  add constraint seo_keywords_difficulty_check
    check (difficulty is null or difficulty between 0 and 100),
  add constraint seo_keywords_cpc_check
    check (cpc is null or cpc >= 0),
  add constraint seo_keywords_intent_check
    check (intent in ('informational', 'navigational', 'commercial', 'transactional'));

create index seo_keywords_pending_country_idx
  on public.seo_keywords (country, created_at desc)
  where status = 'pending';
create index seo_keywords_search_volume_idx
  on public.seo_keywords (search_volume desc nulls last, created_at desc)
  where status = 'published' and page_content is not null;

create table public.seo_api_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique
    check (provider in ('semrush', 'ahrefs', 'dataforseo')),
  api_key text not null check (length(api_key) between 32 and 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seo_api_keys enable row level security;
revoke all on public.seo_api_keys from public, anon, authenticated;
grant all on public.seo_api_keys to service_role;

notify pgrst, 'reload schema';
commit;
