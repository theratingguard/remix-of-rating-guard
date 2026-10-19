do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in ('address', 'avatar_url', 'banner_url', 'business_name', 'website_url')
    group by table_name
    having count(*) = 5
  ) then
    raise exception 'Profile asset and contact columns are missing';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'profile-assets'
      and public
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  ) then
    raise exception 'Profile assets bucket settings are incorrect';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'owner_access'
      and 'authenticated' = any(roles)
      and qual ilike '%auth.uid%'
      and with_check ilike '%auth.uid%'
  ) then
    raise exception 'Profile updates are not restricted to the authenticated owner';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_assets_public_read'
      and 'public' = any(roles)
      and qual ilike '%profile-assets%'
  ) then
    raise exception 'Profile asset public read policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_assets_owner_insert'
      and 'authenticated' = any(roles)
      and with_check ilike '%auth.uid%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_assets_owner_update'
      and 'authenticated' = any(roles)
      and qual ilike '%auth.uid%'
      and with_check ilike '%auth.uid%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'profile_assets_owner_delete'
      and 'authenticated' = any(roles)
      and qual ilike '%auth.uid%'
  ) then
    raise exception 'Profile storage writes are not restricted to the authenticated owner';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'sync_profile_contact_to_role_profiles'
      and not tgisinternal
  ) then
    raise exception 'Profile contact synchronization trigger is missing';
  end if;
end
$$;
