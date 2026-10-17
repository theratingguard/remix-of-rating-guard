begin;

create or replace function public.can_review_staff_activity(_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.report_access_level() = 'super_admin'
    or exists (
      select 1
      from public.staff target
      join public.staff lead on lead.id = auth.uid()
      where target.id = _staff_id
        and target.team_lead is not null
        and target.team_lead in (lead.id::text, lead.name)
        and lead.status in ('approved', 'active')
        and lower(lead.role) in ('team lead', 'team_lead')
    )
  )
$$;

revoke all on function public.can_review_staff_activity(uuid) from public, anon;
grant execute on function public.can_review_staff_activity(uuid) to authenticated;

create table public.communication_log (
  id uuid primary key default gen_random_uuid(),
  review_tracking_id uuid not null references public.staff_cases(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  log_type text not null check (log_type in ('call', 'whatsapp', 'email')),
  direction text not null check (direction in ('outbound', 'inbound')),
  contact_person text check (contact_person is null or length(contact_person) <= 160),
  contact_number text check (contact_number is null or length(contact_number) <= 32),
  contact_email text check (contact_email is null or length(contact_email) <= 320),
  summary text not null check (length(trim(summary)) between 1 and 4000),
  outcome text not null check (outcome in ('no_answer', 'agreed', 'refused', 'considering')),
  follow_up_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  email_subject text check (email_subject is null or length(email_subject) <= 500),
  email_body text check (email_body is null or length(email_body) <= 10000),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  investigation_flag boolean not null default false,
  investigation_note text check (investigation_note is null or length(investigation_note) <= 2000),
  created_at timestamptz not null default now(),
  unique (id, staff_id),
  check ((verified_by is null) = (verified_at is null)),
  check (not investigation_flag or nullif(trim(investigation_note), '') is not null),
  check (log_type <> 'email' or contact_email is not null)
);

create table public.communication_evidence (
  id uuid primary key default gen_random_uuid(),
  communication_log_id uuid not null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  evidence_type text not null check (
    evidence_type in ('screenshot', 'photo', 'audio', 'pdf', 'video', 'document')
  ),
  file_url text not null check (length(file_url) <= 1024),
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (communication_log_id, staff_id)
    references public.communication_log(id, staff_id) on delete cascade
);

create table public.call_log (
  id uuid primary key default gen_random_uuid(),
  review_tracking_id uuid not null references public.staff_cases(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  phone_number text not null check (length(phone_number) between 1 and 32),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  outcome text not null check (outcome in ('no_answer', 'agreed', 'refused', 'considering')),
  notes text not null check (length(trim(notes)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  review_tracking_id uuid not null references public.staff_cases(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  to_email text not null check (length(to_email) between 3 and 320),
  subject text not null check (length(trim(subject)) between 1 and 500),
  body text not null check (length(trim(body)) between 1 and 10000),
  sent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index communication_log_staff_created_idx
  on public.communication_log (staff_id, created_at desc);
create index communication_log_review_created_idx
  on public.communication_log (review_tracking_id, created_at desc);
create index communication_log_follow_up_idx
  on public.communication_log (follow_up_at) where follow_up_at is not null;
create index communication_evidence_log_idx
  on public.communication_evidence (communication_log_id, created_at desc);
create index call_log_staff_created_idx on public.call_log (staff_id, created_at desc);
create index email_log_staff_created_idx on public.email_log (staff_id, created_at desc);

alter table public.communication_log enable row level security;
alter table public.communication_evidence enable row level security;
alter table public.call_log enable row level security;
alter table public.email_log enable row level security;

revoke all on public.communication_log, public.communication_evidence,
  public.call_log, public.email_log from public, anon, authenticated;
grant select (id, name) on public.staff to authenticated;
grant select on public.communication_log to authenticated;
grant insert (
  review_tracking_id, staff_id, log_type, direction, contact_person, contact_number,
  contact_email, summary, outcome, follow_up_at, duration_seconds, email_subject, email_body
) on public.communication_log to authenticated;
grant update (verified_by, verified_at, investigation_flag, investigation_note)
  on public.communication_log to authenticated;
grant select, insert on public.communication_evidence to authenticated;
grant select on public.call_log, public.email_log to authenticated;
grant all on public.communication_log, public.communication_evidence,
  public.call_log, public.email_log to service_role;

create policy communication_log_read_scoped on public.communication_log
  for select to authenticated
  using (staff_id = auth.uid() or public.can_review_staff_activity(staff_id));
create policy staff_team_lead_activity_read on public.staff
  for select to authenticated
  using (public.can_review_staff_activity(id));
create policy communication_log_insert_assigned on public.communication_log
  for insert to authenticated
  with check (
    staff_id = auth.uid()
    and exists (
      select 1 from public.staff_cases c
      where c.id = review_tracking_id and c.staff_id = auth.uid()
    )
  );
create policy communication_log_verify_team on public.communication_log
  for update to authenticated
  using (public.can_review_staff_activity(staff_id))
  with check (
    public.can_review_staff_activity(staff_id)
    and (verified_by is null or verified_by = auth.uid())
  );

create policy communication_evidence_read_scoped on public.communication_evidence
  for select to authenticated
  using (staff_id = auth.uid() or public.can_review_staff_activity(staff_id));
create policy communication_evidence_insert_own on public.communication_evidence
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and staff_id = auth.uid()
    and exists (
      select 1 from public.communication_log c
      where c.id = communication_log_id and c.staff_id = auth.uid()
    )
  );

create policy call_log_read_scoped on public.call_log
  for select to authenticated
  using (staff_id = auth.uid() or public.can_review_staff_activity(staff_id));
create policy email_log_read_scoped on public.email_log
  for select to authenticated
  using (staff_id = auth.uid() or public.can_review_staff_activity(staff_id));

create or replace function public.mirror_communication_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.log_type = 'call' then
    insert into public.call_log (
      review_tracking_id, staff_id, phone_number, duration_seconds, outcome, notes, created_at
    ) values (
      new.review_tracking_id, new.staff_id, coalesce(new.contact_number, ''),
      new.duration_seconds, new.outcome, new.summary, new.created_at
    );
  elsif new.log_type = 'email' then
    insert into public.email_log (
      review_tracking_id, staff_id, to_email, subject, body, sent_at, created_at
    ) values (
      new.review_tracking_id, new.staff_id, new.contact_email,
      coalesce(new.email_subject, '(no subject)'), coalesce(new.email_body, new.summary),
      new.created_at, new.created_at
    );
  end if;
  return new;
end
$$;

revoke all on function public.mirror_communication_log() from public, anon, authenticated;
create trigger mirror_communication_log
  after insert on public.communication_log
  for each row execute function public.mirror_communication_log();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/pdf', 'audio/mpeg', 'video/mp4', 'text/plain']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_storage_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[^/]+$')
  );
create policy evidence_storage_read_scoped on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.communication_evidence e
        where e.file_url = name and public.can_review_staff_activity(e.staff_id)
      )
    )
  );
create policy evidence_storage_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.client_review_outcomes()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with owned as (
    select
      c.id,
      exists (
        select 1 from public.review_actions ra
        where ra.review_id = c.review_id and ra.status = 'REMOVED'
      ) as removed
    from public.staff_cases c
    where auth.uid() is not null
      and auth.jwt() -> 'app_metadata' ->> 'role' = 'client'
      and c.client_user_id = auth.uid()
  ),
  counts as (
    select
      count(*) filter (where removed)::integer as total_removed,
      count(*) filter (where not removed)::integer as total_pending
    from owned
  )
  select jsonb_build_object(
    'totalRemoved', counts.total_removed,
    'totalPending', counts.total_pending,
    'proofs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'resolution', 'Review removal confirmed'
      ))
      from owned where owned.removed
    ), '[]'::jsonb)
  )
  from counts
$$;

revoke all on function public.client_review_outcomes() from public, anon;
grant execute on function public.client_review_outcomes() to authenticated;

notify pgrst, 'reload schema';
commit;
