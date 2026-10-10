begin;
insert into auth.users(id) values
  ('b95fa860-014d-4a5e-9579-bd6d21ad0051'),
  ('b95fa860-014d-4a5e-9579-bd6d21ad0052');
insert into public.user_roles(user_id,role)
  values ('b95fa860-014d-4a5e-9579-bd6d21ad0052','admin');
update public.site_content set published='{"heroTitle":"Published policy fixture"}',
  draft='{"heroTitle":"Private draft fixture"}' where id='home';
set local role anon;
do $$
declare content jsonb;
begin
  content := public.get_published_site_content();
  if content ? 'draft' or content->'published'->>'heroTitle' <> 'Published policy fixture' then
    raise exception 'Published projection failed';
  end if;
  if has_table_privilege('anon','public.site_content','SELECT') then
    raise exception 'Anonymous draft table privilege remains';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b95fa860-014d-4a5e-9579-bd6d21ad0051',true);
do $$
begin
  if (select count(*) from public.site_content) <> 0 then raise exception 'Non-admin draft read permitted'; end if;
  begin
    insert into public.site_content(id) values('forbidden-content-fixture');
    raise exception 'Non-admin content write permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','b95fa860-014d-4a5e-9579-bd6d21ad0052',true);
do $$
begin
  if (select draft->>'heroTitle' from public.site_content where id='home') <> 'Private draft fixture' then
    raise exception 'Admin draft read failed';
  end if;
  update public.site_content set draft='{"heroTitle":"Saved draft fixture"}' where id='home';
  if (select draft->>'heroTitle' from public.site_content where id='home') <> 'Saved draft fixture' then
    raise exception 'Admin save/reload failed';
  end if;
end $$;
select 'Published projection, non-admin isolation and admin save/reload passed; all fixtures rolled back' as content_security_test;
rollback;
