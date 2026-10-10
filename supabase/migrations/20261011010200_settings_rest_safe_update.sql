begin;
create or replace function public.update_app_settings(_settings jsonb) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if public.report_access_level()<>'super_admin' then raise exception 'Access Denied'; end if;
 if jsonb_typeof(_settings)<>'object' or (select count(*) from jsonb_object_keys(_settings))<>14
   or exists(select 1 from jsonb_object_keys(_settings) k where not exists(select 1 from public.app_settings s where s.key=k)) then
   raise exception 'Exactly all supported settings required'; end if;
 update public.app_settings s set value=_settings->s.key,updated_at=clock_timestamp()
 where s.key in (select jsonb_object_keys(_settings));
end $$;
notify pgrst,'reload schema';
commit;
