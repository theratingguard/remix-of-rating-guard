begin;

create table if not exists public.country_hashtags (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  hashtag text not null check (hashtag ~ '^#[A-Za-z][A-Za-z0-9]{1,31}$'),
  created_at timestamptz not null default now(),
  unique (country_code, hashtag)
);

alter table public.country_hashtags enable row level security;
revoke all on public.country_hashtags from public, anon, authenticated;
grant select on public.country_hashtags to anon, authenticated;
grant all on public.country_hashtags to service_role;

drop policy if exists country_hashtags_read on public.country_hashtags;
create policy country_hashtags_read on public.country_hashtags
  for select to anon, authenticated
  using (true);

with countries(country_code, legacy_suffix) as (
  values
    ('US', 'USA'), ('GB', 'UK'), ('ES', 'Spain'), ('FR', 'France'), ('DE', 'Germany'),
    ('AE', 'UAE'), ('IN', 'India'), ('JP', 'Japan'), ('BR', 'Brazil'), ('CA', 'Canada'),
    ('AU', 'Australia'), ('IT', 'Italy'), ('NL', 'Netherlands'), ('KR', 'SouthKorea'),
    ('CN', 'China'), ('TR', 'Turkey'), ('ID', 'Indonesia'), ('SE', 'Sweden'),
    ('PL', 'Poland'), ('SG', 'Singapore')
)
delete from public.country_hashtags as stored
using countries
where stored.country_code = countries.country_code
  and stored.hashtag in (
    '#' || 'GoogleReviews' || countries.legacy_suffix,
    '#' || 'ReviewManagement' || countries.legacy_suffix,
    '#' || 'OnlineReputation' || countries.legacy_suffix,
    '#' || 'ReviewPolicy' || countries.legacy_suffix,
    '#' || 'RatingGuard' || countries.legacy_suffix
  );

with countries(country_code, suffix) as (
  values
    ('US', 'US'), ('GB', 'UK'), ('ES', 'ES'), ('FR', 'FR'), ('DE', 'DE'),
    ('AE', 'UAE'), ('IN', 'IN'), ('JP', 'JP'), ('BR', 'BR'), ('CA', 'CA'),
    ('AU', 'AU'), ('IT', 'IT'), ('NL', 'NL'), ('KR', 'KR'), ('CN', 'CN'),
    ('TR', 'TR'), ('ID', 'ID'), ('SE', 'SE'), ('PL', 'PL'), ('SG', 'SG')
),
service_terms(service) as (
  values
    ('GoogleReview'),
    ('FakeReviewRemoval'),
    ('ReputationManagement'),
    ('GoogleReviewFix'),
    ('ReviewRemovalService'),
    ('FakeReviewPolicy'),
    ('OnlineReputation'),
    ('ReviewProtection'),
    ('ReviewRecovery'),
    ('BusinessReviews')
),
actions(action) as (
  values
    (''),
    ('Remove'),
    ('Delete'),
    ('Manage'),
    ('Protect'),
    ('Recover'),
    ('Check'),
    ('Report'),
    ('Support'),
    ('Improve')
)
insert into public.country_hashtags (country_code, hashtag)
select
  countries.country_code,
  '#' || actions.action || service_terms.service ||
    case
      when countries.country_code = 'US'
        and actions.action = ''
        and service_terms.service = 'FakeReviewRemoval'
      then 'USA'
      else countries.suffix
    end
from countries
cross join service_terms
cross join actions
on conflict (country_code, hashtag) do nothing;

notify pgrst, 'reload schema';
commit;
