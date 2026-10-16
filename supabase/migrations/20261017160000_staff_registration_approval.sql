begin;

alter table public.staff
  add column if not exists live_selfie_url text,
  add column if not exists latitude numeric(10, 8),
  add column if not exists longitude numeric(11, 8),
  add column if not exists address text,
  add column if not exists referral_by text,
  add column if not exists reject_reason text,
  add column if not exists reject_reason_custom text,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists ip_address inet,
  add column if not exists user_agent text,
  add column if not exists timezone text;

alter table public.staff
  drop constraint if exists staff_reject_reason_check;
alter table public.staff
  add constraint staff_reject_reason_check
  check (reject_reason is null or reject_reason in (
    'fake_account', 'duplicate', 'suspicious_location', 'incomplete_info', 'other'
  ));

create table if not exists public.staff_activity_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  action text not null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_activity_log_staff_idx
  on public.staff_activity_log (staff_id, created_at desc);

alter table public.staff_activity_log enable row level security;
revoke all on public.staff_activity_log from public, anon, authenticated;
grant select on public.staff_activity_log to authenticated;
grant all on public.staff_activity_log to service_role;

drop policy if exists staff_activity_log_read on public.staff_activity_log;
create policy staff_activity_log_read on public.staff_activity_log
  for select to authenticated
  using (
    staff_id = auth.uid()
    or public.report_access_level() = 'super_admin'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg'];

drop policy if exists staff_photos_upload_own on storage.objects;
create policy staff_photos_upload_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/selfie-[0-9]+\.jpg$')
  );

drop policy if exists staff_photos_admin_read on storage.objects;
create policy staff_photos_admin_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-photos'
    and public.report_access_level() = 'super_admin'
  );

create or replace function public.create_pending_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if profile ->> 'is_staff_registration' = 'true' then
    insert into public.staff (
      id, name, mobile, email, region_city, region_state, status, role,
      team_lead, skills, address, latitude, longitude, referral_by, timezone
    ) values (
      new.id,
      left(coalesce(nullif(trim(profile ->> 'name'), ''), 'Staff applicant'), 120),
      left(coalesce(nullif(trim(profile ->> 'mobile'), ''), 'unknown'), 32),
      new.email,
      left(coalesce(nullif(trim(profile ->> 'region_city'), ''), 'Unknown'), 120),
      left(coalesce(nullif(trim(profile ->> 'region_state'), ''), 'Unknown'), 120),
      'pending',
      'Case Handler',
      nullif(left(trim(profile ->> 'team_lead'), 120), ''),
      case when jsonb_typeof(profile -> 'skills') = 'array'
        then array(select jsonb_array_elements_text(profile -> 'skills'))
        else '{}'::text[]
      end,
      nullif(left(trim(profile ->> 'address'), 500), ''),
      nullif(profile ->> 'latitude', '')::numeric,
      nullif(profile ->> 'longitude', '')::numeric,
      nullif(left(trim(profile ->> 'referral_by'), 160), ''),
      nullif(left(trim(profile ->> 'timezone'), 100), '')
    );
    insert into public.staff_activity_log (staff_id, action, metadata)
    values (new.id, 'register', jsonb_build_object('status', 'pending'));
  end if;
  return new;
end;
$$;

drop trigger if exists create_pending_staff_profile on auth.users;
create trigger create_pending_staff_profile
  after insert on auth.users
  for each row execute function public.create_pending_staff_profile();

notify pgrst, 'reload schema';
commit;
