begin;

insert into public.site_content(id) values ('home') on conflict(id) do nothing;

alter policy content_read on public.site_content to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
revoke select on public.site_content from anon;
revoke execute on function public.has_role(uuid, public.app_role) from anon;

create or replace function public.get_published_site_content() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('published', published, 'published_at', published_at)
  from public.site_content where id = 'home'
$$;
revoke all on function public.get_published_site_content() from public;
grant execute on function public.get_published_site_content() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
