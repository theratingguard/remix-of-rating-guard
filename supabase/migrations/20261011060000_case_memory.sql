begin;
create table public.case_memory (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete cascade,
  business_type text not null,
  policy_type text not null,
  evidence_pattern text not null,
  evidence_strength integer check(evidence_strength between 0 and 100),
  review_text text not null,
  outcome text not null check(outcome in ('approved','rejected','pending')),
  days_to_response integer check(days_to_response >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(outcome='pending' or days_to_response is not null)
);
create index idx_memory_policy on public.case_memory(policy_type);
create index idx_memory_outcome on public.case_memory(outcome);
create table public.learning_snapshots (
  id text primary key check(id='weekly'),
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.case_memory enable row level security;
alter table public.learning_snapshots enable row level security;
revoke all on public.case_memory, public.learning_snapshots from anon, authenticated;
grant select on public.case_memory, public.learning_snapshots to authenticated;
grant all on public.case_memory, public.learning_snapshots to service_role;
create policy super_admin_memory on public.case_memory for select to authenticated
  using(public.report_access_level()='super_admin');
create policy super_admin_learning on public.learning_snapshots for select to authenticated
  using(public.report_access_level()='super_admin');

create function public.save_case_memory(_review_id uuid, _outcome text) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  r public.reviews%rowtype;
  s public.scans%rowtype;
  o public.removal_outcomes%rowtype;
  legal jsonb;
  strength integer;
  result uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' and
    coalesce(public.report_access_level(),'')<>'super_admin' then
    raise exception 'Access Denied: case memory is Super Admin only';
  end if;
  if _outcome not in ('approved','rejected','pending') or _outcome is null then
    raise exception 'Invalid case outcome';
  end if;
  select * into strict r from public.reviews where id=_review_id;
  select * into strict s from public.scans where id=r.scan_id;
  if s.is_seed then raise exception 'Seed reviews cannot become case memory'; end if;
  select * into o from public.removal_outcomes where review_id=_review_id;
  if _outcome<>coalesce(o.outcome,'pending') then
    raise exception 'Record an actual decision before saving a decided memory';
  end if;
  select item into legal from public.reports p,
    lateral jsonb_array_elements(coalesce(p.report_data->'legal_analysis'->'reviews','[]'::jsonb)) item
    where p.scan_id=r.scan_id and item->>'review_id'=_review_id::text limit 1;
  if legal is not null then
    select ((component->>'score')::numeric * 5)::integer into strength
      from jsonb_array_elements(coalesce(legal->'quality'->'components','[]'::jsonb)) component
      where component->>'name'='Evidence strength' and
        jsonb_typeof(component->'score')='number' limit 1;
  end if;
  insert into public.case_memory(
    review_id,business_type,policy_type,evidence_pattern,evidence_strength,
    review_text,outcome,days_to_response,updated_at
  ) values(
    _review_id,coalesce(o.business_type,s.category,''),coalesce(o.policy_type,legal->>'policy_type',''),
    coalesce(legal->>'evidence_quote',''),strength,coalesce(r.text,''),_outcome,
    case when _outcome='pending' then null
      else greatest(0,extract(epoch from (o.response_at-o.submitted_at))/86400)::integer end,
    now()
  ) on conflict(review_id) do update set
    business_type=excluded.business_type,policy_type=excluded.policy_type,
    evidence_pattern=excluded.evidence_pattern,evidence_strength=excluded.evidence_strength,
    review_text=excluded.review_text,outcome=excluded.outcome,
    days_to_response=excluded.days_to_response,updated_at=excluded.updated_at
  returning id into result;
  return result;
end $$;
revoke all on function public.save_case_memory(uuid,text) from public, anon;
grant execute on function public.save_case_memory(uuid,text) to authenticated, service_role;

create function public.sync_case_memory() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if tg_table_name='removal_outcomes' then
    perform public.save_case_memory(new.review_id,new.outcome);
  else
    if new.report_data->'legal_analysis' is null then return new; end if;
    for r in select rv.id,coalesce(o.outcome,'pending') outcome
      from public.reviews rv left join public.removal_outcomes o on o.review_id=rv.id
      where rv.scan_id=new.scan_id and not exists(
        select 1 from public.scans s where s.id=rv.scan_id and s.is_seed
      ) loop
      perform public.save_case_memory(r.id,r.outcome);
    end loop;
  end if;
  return new;
end $$;
revoke all on function public.sync_case_memory() from public, anon, authenticated;
create trigger sync_outcome_memory after insert or update on public.removal_outcomes
  for each row execute function public.sync_case_memory();
create trigger sync_report_memory after insert or update of report_data on public.reports
  for each row execute function public.sync_case_memory();
notify pgrst,'reload schema';
commit;
