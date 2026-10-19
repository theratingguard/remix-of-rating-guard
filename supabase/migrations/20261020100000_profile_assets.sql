begin;

alter table public.profiles
  add column address text,
  add column avatar_url text,
  add column banner_url text,
  add column business_name text,
  add column website_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-assets',
  'profile-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_assets_public_read on storage.objects;
create policy profile_assets_public_read on storage.objects
  for select to public
  using (bucket_id = 'profile-assets');

drop policy if exists profile_assets_owner_insert on storage.objects;
create policy profile_assets_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists profile_assets_owner_update on storage.objects;
create policy profile_assets_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists profile_assets_owner_delete on storage.objects;
create policy profile_assets_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.sync_profile_contact_to_role_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.staff
  set name = new.name,
      mobile = coalesce(nullif(btrim(new.phone), ''), mobile),
      address = nullif(btrim(new.address), ''),
      updated_at = now()
  where id = new.user_id;

  update public.reseller_profiles
  set mobile = nullif(btrim(new.phone), ''),
      updated_at = now()
  where user_id = new.user_id;

  return new;
end
$$;

revoke all on function public.sync_profile_contact_to_role_profiles()
  from public, anon, authenticated;

drop trigger if exists sync_profile_contact_to_role_profiles on public.profiles;
create trigger sync_profile_contact_to_role_profiles
  after update of name, phone, address on public.profiles
  for each row
  when (
    old.name is distinct from new.name
    or old.phone is distinct from new.phone
    or old.address is distinct from new.address
  )
  execute function public.sync_profile_contact_to_role_profiles();

notify pgrst, 'reload schema';
commit;
