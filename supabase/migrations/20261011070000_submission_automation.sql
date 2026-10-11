begin;
create table public.submission_status (
  id uuid primary key default gen_random_uuid(),
  removal_request_id uuid not null unique references public.removal_outcomes(id) on delete cascade,
  status text not null default 'submitted' check(status in ('submitted','approved','rejected')),
  last_checked timestamptz,
  google_response text,
  response_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.submission_notifications (
  id uuid primary key default gen_random_uuid(),
  removal_request_id uuid not null references public.removal_outcomes(id) on delete cascade,
  event text not null check(event in ('submitted','approved','rejected','appeal_needed','response_received','followup_due')),
  message text not null,
  event_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.submission_status enable row level security;
alter table public.submission_notifications enable row level security;
revoke all on public.submission_status, public.submission_notifications from anon, authenticated;
grant select on public.submission_status, public.submission_notifications to authenticated;
grant all on public.submission_status, public.submission_notifications to service_role;
create policy super_admin_submission_status on public.submission_status for select to authenticated
  using(public.report_access_level()='super_admin');
create policy super_admin_submission_notifications on public.submission_notifications for select to authenticated
  using(public.report_access_level()='super_admin');

create function public.sync_submission_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_name text; version text;
begin
  insert into public.submission_status(removal_request_id,status,google_response,response_at)
    values(new.id,case when new.outcome='pending' then 'submitted' else new.outcome end,
      new.verification_reference,new.response_at)
    on conflict(removal_request_id) do update set status=excluded.status,
      google_response=excluded.google_response,response_at=excluded.response_at;
  if tg_op='INSERT' or new.outcome is distinct from old.outcome then
    event_name:=case when new.outcome='pending' then 'submitted' else new.outcome end;
    version:=new.id::text||':'||event_name||':'||coalesce(new.response_at::text,new.submitted_at::text);
    insert into public.submission_notifications(removal_request_id,event,message,event_key)
      values(new.id,event_name,'Representative recorded submission status: '||event_name,version)
      on conflict(event_key) do nothing;
    if new.outcome<>'pending' then
      insert into public.submission_notifications(removal_request_id,event,message,event_key)
        values(new.id,'response_received','A representative-recorded Google response is available.',version||':response')
        on conflict(event_key) do nothing;
    end if;
    if new.outcome='rejected' then
      insert into public.submission_notifications(removal_request_id,event,message,event_key)
        values(new.id,'appeal_needed','Recorded rejection: review the evidence and prepare the one-time appeal.',version||':appeal')
        on conflict(event_key) do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.sync_submission_status() from public, anon, authenticated;
create trigger sync_submission_status after insert or update on public.removal_outcomes
  for each row execute function public.sync_submission_status();
insert into public.submission_status(removal_request_id,status,google_response,response_at)
  select id,case when outcome='pending' then 'submitted' else outcome end,verification_reference,response_at
  from public.removal_outcomes;
create function public.record_submission_followup(p_request_id uuid, p_checked_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_checked_at is null or p_checked_at>now()+interval '1 minute' then
    raise exception 'Invalid follow-up timestamp';
  end if;
  perform 1 from public.submission_status
    where removal_request_id=p_request_id and status='submitted' for update;
  if not found then return false; end if;
  insert into public.submission_notifications(removal_request_id,event,message,event_key)
    values(p_request_id,'followup_due',
      'Pending submission: check the official Reviews Management Tool. No new Google decision has been captured.',
      p_request_id::text||':followup:'||(p_checked_at at time zone 'UTC')::date::text)
    on conflict(event_key) do nothing;
  update public.submission_status set last_checked=p_checked_at
    where removal_request_id=p_request_id;
  return true;
end $$;
revoke all on function public.record_submission_followup(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.record_submission_followup(uuid,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
