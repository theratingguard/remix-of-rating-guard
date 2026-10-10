begin;
create table public.removal_outcomes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id),
  scan_id uuid not null references public.scans(id),
  user_id uuid not null default auth.uid() references auth.users(id),
  policy_type text not null check(length(policy_type) between 1 and 200),
  business_type text not null check(length(business_type) between 1 and 200),
  submitted_at timestamptz not null check(submitted_at <= now()),
  outcome text not null default 'pending' check(outcome in ('approved','rejected','pending')),
  response_at timestamptz,
  verification_reference text not null check(length(verification_reference) between 10 and 2000),
  evidence_used jsonb not null default '{}',
  request_text text not null check(length(request_text) between 1 and 12000),
  created_at timestamptz not null default now(),
  check((outcome='pending' and response_at is null) or
    (outcome<>'pending' and response_at is not null and response_at >= submitted_at and response_at <= now()))
);
create table public.appeal_tracking (
  id uuid primary key default gen_random_uuid(),
  removal_request_id uuid not null unique references public.removal_outcomes(id) on delete cascade,
  submitted_at timestamptz,
  response_at timestamptz,
  response text,
  appeal_draft text check(length(appeal_draft) <= 16000),
  status text not null default 'pending' check(status in ('pending','needed','draft','submitted','closed')),
  due_at timestamptz not null,
  check((status='submitted' and submitted_at is not null) or status<>'submitted')
);
alter table public.removal_outcomes enable row level security;
alter table public.appeal_tracking enable row level security;
revoke all on public.removal_outcomes, public.appeal_tracking from anon, authenticated;
grant select, insert, update on public.removal_outcomes to authenticated;
grant select, update on public.appeal_tracking to authenticated;
grant all on public.removal_outcomes, public.appeal_tracking to service_role;
create policy super_admin_outcomes on public.removal_outcomes for all to authenticated
  using(public.report_access_level()='super_admin')
  with check(public.report_access_level()='super_admin' and user_id=auth.uid());
create policy super_admin_appeals on public.appeal_tracking for all to authenticated
  using(public.report_access_level()='super_admin')
  with check(public.report_access_level()='super_admin');
create function public.validate_removal_submission() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.reviews r where r.id=new.review_id and r.scan_id=new.scan_id) then
    raise exception 'Review and scan do not match';
  end if;
  if tg_op='UPDATE' and (new.review_id<>old.review_id or new.scan_id<>old.scan_id or
    new.submitted_at<>old.submitted_at or new.user_id<>old.user_id) then
    raise exception 'Original submission identity and date cannot be changed';
  end if;
  return new;
end $$;
create trigger validate_removal_submission before insert or update on public.removal_outcomes
  for each row execute function public.validate_removal_submission();
create function public.schedule_removal_followup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.appeal_tracking(removal_request_id,due_at,status)
    values(new.id,new.submitted_at+interval '7 days',
      case new.outcome when 'approved' then 'closed' when 'rejected' then 'needed' else 'pending' end)
    on conflict(removal_request_id) do update set
      response_at=new.response_at, response=new.verification_reference,
      status=case when new.outcome='approved' then 'closed'
        when new.outcome='rejected' and public.appeal_tracking.status='pending' then 'needed'
        else public.appeal_tracking.status end;
  return new;
end $$;
create trigger schedule_removal_followup after insert or update of outcome on public.removal_outcomes
  for each row execute function public.schedule_removal_followup();
create function public.validate_one_time_appeal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.removal_request_id<>old.removal_request_id then raise exception 'Appeal request identity cannot change'; end if;
  if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    raise exception 'Only one appeal submission may be recorded';
  end if;
  if new.status in ('draft','submitted') and not exists(
    select 1 from public.removal_outcomes o where o.id=new.removal_request_id and o.outcome='rejected'
  ) then raise exception 'A recorded rejection is required before appeal'; end if;
  if new.status='submitted' and (new.submitted_at>now() or coalesce(length(trim(new.appeal_draft)),0)=0) then
    raise exception 'An actual submission date and reviewed appeal draft are required';
  end if;
  return new;
end $$;
create trigger validate_one_time_appeal before update on public.appeal_tracking
  for each row execute function public.validate_one_time_appeal();
revoke all on function public.validate_removal_submission(), public.schedule_removal_followup()
  from public, anon, authenticated;
revoke all on function public.validate_one_time_appeal() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
