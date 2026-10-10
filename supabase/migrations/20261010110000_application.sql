-- Additive application contract for project bdudkvrsbznpmyfzsahm.
-- Abort on existing objects rather than silently accepting incompatible schemas.
begin;
create type public.app_role as enum ('admin', 'user');
create table public.profiles (
  user_id uuid primary key references auth.users(id), name text not null default 'User',
  username text, avatar_path text, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  role public.app_role not null, unique(user_id, role)
);
create table public.businesses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  place_id text, name text not null, category text, address text, rating numeric check(rating between 0 and 5),
  total_reviews integer check(total_reviews >= 0), maps_uri text, latitude double precision,
  longitude double precision, is_seed boolean not null default false check(not is_seed),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, place_id), unique(id, user_id)
);
create table public.scan_batches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  batch_number text not null unique default ('BATCH-' || gen_random_uuid()::text),
  total integer not null default 0 check(total >= 0), created_at timestamptz not null default now(),
  unique(id, user_id)
);
create table public.scans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  batch_id uuid references public.scan_batches(id), business_id uuid references public.businesses(id),
  source_url text not null, place_id text, business_name text, category text, address text,
  rating numeric check(rating between 0 and 5), total_reviews integer check(total_reviews >= 0),
  maps_uri text, data_source text not null default 'google_places',
  status text not null default 'pending' check(status in ('pending','running','complete','failed')),
  stage text, error text, is_seed boolean not null default false check(not is_seed),
  reviews_retrieved integer not null default 0 check(reviews_retrieved >= 0),
  high_count integer not null default 0, medium_count integer not null default 0,
  normal_count integer not null default 0, requires_review_count integer not null default 0,
  reviews_failed_analysis integer not null default 0, rating_mismatch boolean not null default false,
  api_rating_raw numeric, api_total_reviews_raw integer, data_quality text,
  data_quality_reasons text[] not null default '{}', review_health_score integer,
  started_at timestamptz default now(), completed_at timestamptz, created_at timestamptz not null default now(),
  unique(id, user_id),
  foreign key(batch_id, user_id) references public.scan_batches(id, user_id),
  foreign key(business_id, user_id) references public.businesses(id, user_id)
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), scan_id uuid not null references public.scans(id),
  author text not null default 'Anonymous', author_uri text, rating integer not null check(rating between 1 and 5),
  published_at timestamptz, relative_time text, text text, review_uri text,
  risk text not null default 'requires_review', policy_category text, indicators text[] not null default '{}',
  reason text, evidence text, confidence integer not null default 0 check(confidence between 0 and 100),
  processing_status text not null default 'STORED', content_hash text, created_at timestamptz not null default now(),
  unique(id, scan_id)
);
create table public.review_analyses (
  id uuid primary key default gen_random_uuid(), review_id uuid not null unique references public.reviews(id),
  scan_id uuid not null references public.scans(id), risk text not null default 'requires_review'
    check(risk in ('high','medium','normal','requires_review')),
  category text, signals text[] not null default '{}', reason text, evidence text,
  confidence integer not null default 0 check(confidence between 0 and 100), verification jsonb,
  model text, analysis_provider text, analysis_version text, prompt_version text, content_hash text,
  cached boolean not null default false, created_at timestamptz not null default now(),
  foreign key(review_id, scan_id) references public.reviews(id, scan_id)
);
create table public.review_actions (
  id uuid primary key default gen_random_uuid(), review_id uuid not null unique references public.reviews(id),
  scan_id uuid not null references public.scans(id), user_id uuid not null default auth.uid() references auth.users(id),
  status text not null default 'NOT_REVIEWED', note text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(review_id, scan_id) references public.reviews(id, scan_id),
  foreign key(scan_id, user_id) references public.scans(id, user_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), scan_id uuid not null unique references public.scans(id),
  user_id uuid not null references auth.users(id), report_number text not null unique,
  summary text, recommended_action text, high_risk_count integer not null default 0,
  medium_risk_count integer not null default 0, normal_count integer not null default 0,
  report_data jsonb not null default '{}', status text not null default 'ready',
  is_seed boolean not null default false check(not is_seed), created_at timestamptz not null default now(),
  foreign key(scan_id, user_id) references public.scans(id, user_id)
);
create table public.scan_events (
  id uuid primary key default gen_random_uuid(), scan_id uuid not null references public.scans(id),
  user_id uuid not null references auth.users(id), stage text not null, status text not null default 'ok',
  message text, error_code text, duration_ms integer, created_at timestamptz not null default now(),
  foreign key(scan_id, user_id) references public.scans(id, user_id)
);
create table public.scan_jobs (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.scan_batches(id),
  user_id uuid not null references auth.users(id), url text not null, position integer not null default 0,
  status text not null default 'pending', attempts integer not null default 0, error text,
  scan_id uuid references public.scans(id), next_run_at timestamptz not null default now(), locked_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(batch_id, position),
  foreign key(batch_id, user_id) references public.scan_batches(id, user_id),
  foreign key(scan_id, user_id) references public.scans(id, user_id)
);
create table public.error_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id),
  scan_id uuid references public.scans(id), module text not null, code text not null, message text not null,
  business text, route text, severity text not null default 'LOW', status text not null default 'OPEN',
  resolution text, created_at timestamptz not null default now(),
  foreign key(scan_id, user_id) references public.scans(id, user_id)
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  action text not null, resource text, resource_id text, detail jsonb not null default '{}',
  result text not null default 'success', created_at timestamptz not null default now()
);
create table public.debug_findings (
  id uuid primary key default gen_random_uuid(), finding_code text not null, module text not null,
  component text, route text, severity text not null, status text not null default 'OPEN',
  description text not null, expected text, actual text, root_cause text, reproduction text,
  fix text, verification text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.place_cache (
  place_key text primary key, payload jsonb not null default '{}', fetched_at timestamptz not null default now()
);
create table public.site_content (
  id text primary key default 'home', published jsonb not null default '{}', draft jsonb not null default '{}',
  published_at timestamptz, updated_at timestamptz not null default now()
);
create table public.system_state (
  id text primary key default 'main', queue_paused boolean not null default false, pause_reason text,
  paused_at timestamptz, daily_link_cap integer not null default 1000 check(daily_link_cap > 0),
  last_worker_run timestamptz, worker_lock_until timestamptz, updated_at timestamptz not null default now()
);
insert into public.system_state(id) values ('main');

create index on public.scans(user_id, created_at desc);
create index on public.scans(batch_id);
create index on public.scans(business_id);
create index on public.reports(user_id, created_at desc);
create index on public.reviews(scan_id);
create index on public.review_analyses(scan_id);
create index on public.review_analyses(content_hash, analysis_version, prompt_version);
create index on public.review_actions(scan_id, user_id);
create index on public.scan_events(scan_id, created_at);
create index on public.scan_jobs(user_id, created_at);
create index on public.scan_jobs(status, next_run_at);
create index on public.scan_jobs(scan_id);
create index on public.error_events(user_id, created_at);
create index on public.error_events(scan_id);
create index on public.audit_log(user_id, created_at);

create function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
revoke all on all tables in schema public from anon, authenticated;

-- Owners may read only their data. Client writes use the same ownership checks;
-- composite foreign keys prevent attaching a child to another owner's entity.
do $$
declare t text;
begin
  foreach t in array array['profiles','businesses','scan_batches','scans','reports','scan_events','error_events','review_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_access on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
  foreach t in array array['reviews','review_analyses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy scan_owner on public.%I for all to authenticated using (exists(select 1 from public.scans s where s.id = scan_id and s.user_id = (select auth.uid()))) with check (exists(select 1 from public.scans s where s.id = scan_id and s.user_id = (select auth.uid())))', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
  foreach t in array array['user_roles','scan_jobs','audit_log','debug_findings','place_cache','site_content','system_state'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
create policy roles_read on public.user_roles for select to authenticated using(user_id = (select auth.uid()));
create policy jobs_read on public.scan_jobs for select to authenticated using(user_id = (select auth.uid()));
create policy audit_read on public.audit_log for select to authenticated using(user_id = (select auth.uid()));
create policy audit_insert on public.audit_log for insert to authenticated with check(user_id = (select auth.uid()));
create policy debug_admin on public.debug_findings for all to authenticated
  using(public.has_role(auth.uid(),'admin')) with check(public.has_role(auth.uid(),'admin'));
create policy content_read on public.site_content for select to anon, authenticated using(true);
create policy content_admin on public.site_content for all to authenticated
  using(public.has_role(auth.uid(),'admin')) with check(public.has_role(auth.uid(),'admin'));
create policy state_read on public.system_state for select to authenticated using(true);
grant select on public.user_roles, public.scan_jobs, public.system_state to authenticated;
grant select, insert on public.audit_log to authenticated;
grant select, insert, update on public.debug_findings, public.site_content to authenticated;
grant select on public.site_content to anon;
grant all on all tables in schema public to service_role;
-- No anonymous access to private data, no browser role mutation or queue writes.
revoke all on public.profiles, public.user_roles, public.businesses, public.scan_batches,
  public.scans, public.reviews, public.review_analyses, public.review_actions, public.reports,
  public.scan_events, public.scan_jobs, public.error_events, public.audit_log,
  public.debug_findings, public.place_cache, public.system_state from anon;
revoke all on public.place_cache from authenticated;
revoke insert, update, delete on public.user_roles, public.scan_jobs, public.system_state from authenticated;
revoke delete on all tables in schema public from authenticated;

create function public.acquire_worker_lock(_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare acquired text;
begin
  update public.system_state set worker_lock_until = now() + make_interval(secs => least(greatest(_seconds, 1), 300)),
    last_worker_run = now() where id = 'main' and (worker_lock_until is null or worker_lock_until < now())
    returning id into acquired;
  return acquired is not null;
end $$;
create function public.claim_scan_jobs(_limit integer) returns setof public.scan_jobs
language sql security definer set search_path = '' as $$
  update public.scan_jobs set status = 'processing', attempts = attempts + 1,
    locked_until = now() + interval '10 minutes', updated_at = now()
  where id in (select id from public.scan_jobs
    where (status = 'pending' and next_run_at <= now()) or (status = 'processing' and locked_until < now())
    order by created_at, position for update skip locked limit least(greatest(_limit, 1), 20))
  returning *
$$;
revoke all on function public.acquire_worker_lock(integer), public.claim_scan_jobs(integer) from public, anon, authenticated;
grant execute on function public.acquire_worker_lock(integer), public.claim_scan_jobs(integer) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do nothing;
create policy avatar_owner_read on storage.objects for select to authenticated
  using(bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_owner_insert on storage.objects for insert to authenticated
  with check(bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatar_owner_update on storage.objects for update to authenticated
  using(bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check(bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
notify pgrst, 'reload schema';
commit;
