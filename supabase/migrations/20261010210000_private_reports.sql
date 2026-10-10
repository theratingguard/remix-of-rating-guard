begin;
create table public.report_principals (
  user_id uuid primary key references auth.users(id),
  access_level text not null check (access_level in ('super_admin','franchise','reseller')),
  created_at timestamptz not null default now()
);
alter table public.report_principals enable row level security;
revoke all on public.report_principals from anon, authenticated;
grant all on public.report_principals to service_role;

create table public.report_access (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  access_level text not null default 'owner' check (access_level = 'owner'),
  created_at timestamptz not null default now()
);
alter table public.report_access enable row level security;
revoke all on public.report_access from anon, authenticated;
grant all on public.report_access to service_role;
insert into public.report_access(report_id,owner_id) select id,user_id from public.reports;
create function public.index_report_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.report_access(report_id,owner_id) values(new.id,new.user_id)
    on conflict(report_id) do update set owner_id=excluded.owner_id;
  return new;
end $$;
create trigger index_report_owner after insert or update of user_id on public.reports
  for each row execute function public.index_report_owner();
revoke all on function public.index_report_owner() from public, anon, authenticated;

create function public.report_access_level() returns text language sql stable security definer set search_path='' as $$
  select case when auth.uid() is null then 'denied'
    else coalesce((select access_level from public.report_principals where user_id=auth.uid()),'owner') end
$$;
revoke all on function public.report_access_level() from public, anon;
grant execute on function public.report_access_level() to authenticated, service_role;
create function public.can_read_report_owner(owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    public.report_access_level()='super_admin' or
    (public.report_access_level()='owner' and owner_id=auth.uid())
  )
$$;
revoke all on function public.can_read_report_owner(uuid) from public, anon;
grant execute on function public.can_read_report_owner(uuid) to authenticated, service_role;

create table public.private_selected_artifacts (
  artifact_id uuid primary key,
  scan_id uuid not null references public.scans(id),
  owner_id uuid not null references auth.users(id)
);
alter table public.private_selected_artifacts enable row level security;
revoke all on public.private_selected_artifacts from anon, authenticated;
grant all on public.private_selected_artifacts to service_role;
create function public.register_private_selected_artifact(_artifact_id uuid,_scan_id uuid,_owner_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.reports where scan_id=_scan_id and user_id=_owner_id) then
    raise exception 'Report owner mismatch';
  end if;
  insert into public.private_selected_artifacts values(_artifact_id,_scan_id,_owner_id);
end $$;
revoke all on function public.register_private_selected_artifact(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_private_selected_artifact(uuid,uuid,uuid) to service_role;
create function public.can_download_selected_artifact(_artifact_id uuid,_scan_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.private_selected_artifacts a
    where a.artifact_id=_artifact_id and a.scan_id=_scan_id and public.can_read_report_owner(a.owner_id))
$$;
revoke all on function public.can_download_selected_artifact(uuid,uuid) from public,anon;
grant execute on function public.can_download_selected_artifact(uuid,uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['scans','reports','scan_events','review_actions','scan_jobs','error_events','audit_log'] loop
    execute format('create policy private_report_guard on public.%I as restrictive for all to authenticated using(public.can_read_report_owner(user_id)) with check(public.can_read_report_owner(user_id))',t);
    execute format('create policy super_admin_report_read on public.%I for select to authenticated using(public.report_access_level()=''super_admin'')',t);
  end loop;
  foreach t in array array['reviews','review_analyses'] loop
    execute format('create policy private_report_guard on public.%I as restrictive for all to authenticated using(exists(select 1 from public.scans s where s.id=scan_id and public.can_read_report_owner(s.user_id))) with check(exists(select 1 from public.scans s where s.id=scan_id and public.can_read_report_owner(s.user_id)))',t);
    execute format('create policy super_admin_report_read on public.%I for select to authenticated using(public.report_access_level()=''super_admin'')',t);
  end loop;
end $$;

create function public.private_report_summaries() returns table(scan_id uuid,business_name text,total_reviews integer)
language sql stable security definer set search_path='' as $$
  select s.id,s.business_name,s.total_reviews from public.scans s
  where auth.uid() is not null and s.user_id=auth.uid()
  order by s.created_at desc
$$;
revoke all on function public.private_report_summaries() from public, anon;
grant execute on function public.private_report_summaries() to authenticated;
commit;
