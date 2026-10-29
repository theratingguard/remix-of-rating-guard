begin;

create table public.country_hashtags (
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

create policy country_hashtags_read on public.country_hashtags
  for select to anon, authenticated
  using (true);

with countries(country_code, suffix) as (
  values
    ('US', 'USA'), ('GB', 'UK'), ('ES', 'Spain'), ('FR', 'France'),
    ('DE', 'Germany'), ('AE', 'UAE'), ('IN', 'India'), ('JP', 'Japan'),
    ('BR', 'Brazil'), ('CA', 'Canada'), ('AU', 'Australia'), ('IT', 'Italy'),
    ('NL', 'Netherlands'), ('KR', 'SouthKorea'), ('CN', 'China'), ('TR', 'Turkey'),
    ('ID', 'Indonesia'), ('SE', 'Sweden'), ('PL', 'Poland'), ('SG', 'Singapore')
),
topics(topic) as (
  values
    ('GoogleReviews'),
    ('ReviewManagement'),
    ('OnlineReputation'),
    ('ReviewPolicy'),
    ('RatingGuard')
)
insert into public.country_hashtags (country_code, hashtag)
select countries.country_code, '#' || topics.topic || countries.suffix
from countries
cross join topics
on conflict (country_code, hashtag) do nothing;

notify pgrst, 'reload schema';
commit;
