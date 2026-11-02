begin;

alter table public.review_location_pages
  drop constraint if exists review_location_pages_country_slug_city_slug_key;

alter table public.review_location_pages
  add constraint review_location_pages_country_city_locale_key
  unique (country_slug, city_slug, locale);

drop index if exists public.review_location_pages_published_idx;

create index if not exists review_location_pages_published_locale_city_idx
  on public.review_location_pages (country_slug, locale, city_slug)
  where status = 'published' and published_at is not null;

notify pgrst, 'reload schema';
commit;
