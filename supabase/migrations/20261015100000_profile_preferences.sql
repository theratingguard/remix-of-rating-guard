begin;

alter table public.profiles
  add column phone text,
  add column company_name text,
  add column business_type text,
  add column language text not null default 'en',
  add column timezone text not null default 'UTC',
  add column email_notifications boolean not null default true;

commit;
