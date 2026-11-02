begin;

create table if not exists public.target_industries (
  id serial primary key,
  name text,
  slug text
);

create table if not exists public.target_countries (
  id serial primary key,
  name text,
  code text,
  currency text
);

create unique index if not exists target_industries_slug_key
  on public.target_industries (slug);

create unique index if not exists target_countries_code_key
  on public.target_countries (code);

alter table public.target_industries enable row level security;
alter table public.target_countries enable row level security;

revoke all on public.target_industries from public, anon, authenticated;
revoke all on public.target_countries from public, anon, authenticated;
grant select on public.target_industries to anon, authenticated;
grant select on public.target_countries to anon, authenticated;
grant all on public.target_industries to service_role;
grant all on public.target_countries to service_role;

drop policy if exists target_industries_read on public.target_industries;
create policy target_industries_read on public.target_industries
  for select to anon, authenticated
  using (true);

drop policy if exists target_countries_read on public.target_countries;
create policy target_countries_read on public.target_countries
  for select to anon, authenticated
  using (true);

insert into public.target_industries (name, slug) values
  ('Restaurants & Cafes', 'restaurants'),
  ('Hotels & Hospitality', 'hotels'),
  ('Healthcare & Dental', 'dentists'),
  ('Real Estate', 'real-estate'),
  ('Automotive Services', 'auto-repair'),
  ('Beauty & Personal Care', 'salons'),
  ('Plumbing Services', 'plumbing'),
  ('Electricians', 'electricians'),
  ('Pest Control', 'pest-control'),
  ('Cleaning Companies', 'cleaning'),
  ('Home Renovation', 'renovation'),
  ('Roofing Contractors', 'roofing'),
  ('Lawyers & Law Firms', 'lawyers'),
  ('Accountants', 'accountants'),
  ('Insurance Agencies', 'insurance'),
  ('Gyms & Fitness', 'gyms'),
  ('Coaching Institutes', 'coaching'),
  ('Private Schools', 'schools'),
  ('Daycare Centres', 'daycare'),
  ('Travel Agencies', 'travel'),
  ('Tour Operators', 'tours'),
  ('Wedding Planners', 'wedding'),
  ('Photographers', 'photography'),
  ('Event Venues', 'venues'),
  ('Veterinary Services', 'vets'),
  ('Moving Companies', 'moving'),
  ('Courier Services', 'courier'),
  ('Laundry Services', 'laundry'),
  ('Furniture Stores', 'furniture'),
  ('Computer & Phone Repair', 'tech-repair')
on conflict (slug) do nothing;

insert into public.target_countries (name, code, currency) values
  ('United States', 'us', 'USD'),
  ('United Kingdom', 'gb', 'GBP'),
  ('Canada', 'ca', 'CAD'),
  ('Australia', 'au', 'AUD'),
  ('Germany', 'de', 'EUR'),
  ('France', 'fr', 'EUR'),
  ('Italy', 'it', 'EUR'),
  ('Spain', 'es', 'EUR'),
  ('Netherlands', 'nl', 'EUR'),
  ('Switzerland', 'ch', 'CHF'),
  ('Sweden', 'se', 'SEK'),
  ('Norway', 'no', 'NOK'),
  ('Denmark', 'dk', 'DKK'),
  ('Finland', 'fi', 'EUR'),
  ('Ireland', 'ie', 'EUR'),
  ('Austria', 'at', 'EUR'),
  ('Belgium', 'be', 'EUR'),
  ('Portugal', 'pt', 'EUR'),
  ('Greece', 'gr', 'EUR'),
  ('Poland', 'pl', 'PLN'),
  ('Czechia', 'cz', 'CZK'),
  ('Romania', 'ro', 'RON'),
  ('Hungary', 'hu', 'HUF'),
  ('UAE', 'ae', 'AED'),
  ('Saudi Arabia', 'sa', 'SAR'),
  ('Qatar', 'qa', 'QAR'),
  ('Kuwait', 'kw', 'KWD'),
  ('Israel', 'il', 'ILS'),
  ('Turkey', 'tr', 'TRY'),
  ('India', 'in', 'INR'),
  ('Singapore', 'sg', 'SGD'),
  ('Japan', 'jp', 'JPY'),
  ('South Korea', 'kr', 'KRW'),
  ('China', 'cn', 'CNY'),
  ('Hong Kong', 'hk', 'HKD'),
  ('Malaysia', 'my', 'MYR'),
  ('Indonesia', 'id', 'IDR'),
  ('Thailand', 'th', 'THB'),
  ('Vietnam', 'vn', 'VND'),
  ('Philippines', 'ph', 'PHP'),
  ('New Zealand', 'nz', 'NZD'),
  ('South Africa', 'za', 'ZAR'),
  ('Nigeria', 'ng', 'NGN'),
  ('Kenya', 'ke', 'KES'),
  ('Egypt', 'eg', 'EGP'),
  ('Morocco', 'ma', 'MAD'),
  ('Brazil', 'br', 'BRL'),
  ('Mexico', 'mx', 'MXN'),
  ('Argentina', 'ar', 'ARS'),
  ('Chile', 'cl', 'CLP'),
  ('Colombia', 'co', 'COP'),
  ('Peru', 'pe', 'PEN'),
  ('Russia', 'ru', 'RUB'),
  ('Ukraine', 'ua', 'UAH'),
  ('Kazakhstan', 'kz', 'KZT'),
  ('Pakistan', 'pk', 'PKR'),
  ('Bangladesh', 'bd', 'BDT'),
  ('Sri Lanka', 'lk', 'LKR'),
  ('Nepal', 'np', 'NPR'),
  ('Mauritius', 'mu', 'MUR'),
  ('Bahrain', 'bh', 'BHD'),
  ('Oman', 'om', 'OMR'),
  ('Jordan', 'jo', 'JOD'),
  ('Lebanon', 'lb', 'LBP'),
  ('Iraq', 'iq', 'IQD'),
  ('Georgia', 'ge', 'GEL'),
  ('Armenia', 'am', 'AMD'),
  ('Azerbaijan', 'az', 'AZN'),
  ('Cyprus', 'cy', 'EUR'),
  ('Malta', 'mt', 'EUR'),
  ('Luxembourg', 'lu', 'EUR'),
  ('Iceland', 'is', 'ISK'),
  ('Croatia', 'hr', 'EUR'),
  ('Slovenia', 'si', 'EUR'),
  ('Slovakia', 'sk', 'EUR'),
  ('Bulgaria', 'bg', 'BGN'),
  ('Serbia', 'rs', 'RSD'),
  ('Lithuania', 'lt', 'EUR'),
  ('Latvia', 'lv', 'EUR'),
  ('Estonia', 'ee', 'EUR'),
  ('Belarus', 'by', 'BYN'),
  ('Moldova', 'md', 'MDL'),
  ('Albania', 'al', 'ALL'),
  ('North Macedonia', 'mk', 'MKD'),
  ('Bosnia', 'ba', 'BAM'),
  ('Montenegro', 'me', 'EUR'),
  ('Panama', 'pa', 'PAB'),
  ('Costa Rica', 'cr', 'CRC'),
  ('Dominican Republic', 'do', 'DOP'),
  ('Guatemala', 'gt', 'GTQ'),
  ('Puerto Rico', 'pr', 'USD'),
  ('Uruguay', 'uy', 'UYU'),
  ('Paraguay', 'py', 'PYG'),
  ('Bolivia', 'bo', 'BOB'),
  ('Ecuador', 'ec', 'USD'),
  ('Venezuela', 've', 'VES'),
  ('Trinidad', 'tt', 'TTD'),
  ('Jamaica', 'jm', 'JMD'),
  ('Bahamas', 'bs', 'BSD'),
  ('Fiji', 'fj', 'FJD'),
  ('Papua New Guinea', 'pg', 'PGK'),
  ('Cambodia', 'kh', 'KHR'),
  ('Laos', 'la', 'LAK'),
  ('Myanmar', 'mm', 'MMK'),
  ('Mongolia', 'mn', 'MNT'),
  ('Brunei', 'bn', 'BND'),
  ('Macau', 'mo', 'MOP'),
  ('Taiwan', 'tw', 'TWD'),
  ('Tunisia', 'tn', 'TND'),
  ('Ghana', 'gh', 'GHS'),
  ('Ethiopia', 'et', 'ETB'),
  ('Tanzania', 'tz', 'TZS'),
  ('Uganda', 'ug', 'UGX'),
  ('Zambia', 'zm', 'ZMW'),
  ('Zimbabwe', 'zw', 'ZWL'),
  ('Botswana', 'bw', 'BWP'),
  ('Namibia', 'na', 'NAD'),
  ('Mozambique', 'mz', 'MZN'),
  ('Angola', 'ao', 'AOA')
on conflict (code) do nothing;

grant usage, select on sequence public.target_industries_id_seq to service_role;
grant usage, select on sequence public.target_countries_id_seq to service_role;

notify pgrst, 'reload schema';
commit;
