begin;

alter table public.staff
  add column if not exists monthly_task_target integer not null default 0
    check (monthly_task_target >= 0);

alter table public.staff_cases
  add column if not exists submission_attempts integer default 0
    check (submission_attempts is null or submission_attempts >= 0),
  add column if not exists first_attempt_approved boolean;

alter table public.staff_cases alter column submission_attempts drop not null;

update public.staff_cases as cases
set submission_attempts = (
  select count(*)::integer
  from public.staff_case_events as events
  where events.case_id = cases.id
    and events.event_type = 'submission_recorded'
)
where exists (
  select 1
  from public.staff_case_events as events
  where events.case_id = cases.id
    and events.event_type = 'submission_recorded'
);

update public.staff_cases
set submission_attempts = null
where status in ('submitted', 'reply_received', 'approved', 'rejected', 'rework', 'completed', 'closed')
  and submission_attempts = 0;

create or replace function public.track_staff_case_attempts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from 'submitted' and new.status = 'submitted' then
    new.submission_attempts := case
      when old.submission_attempts is null then null
      else old.submission_attempts + 1
    end;
  end if;

  if old.status is distinct from 'approved' and new.status = 'approved' then
    new.first_attempt_approved := case
      when new.submission_attempts is null or new.submission_attempts < 1 then null
      else new.submission_attempts = 1
    end;
  end if;

  if old.status in ('submitted', 'reply_received')
    and new.status in ('rejected', 'rework')
    and new.first_attempt_approved is null
  then
    new.first_attempt_approved := case
      when new.submission_attempts is null or new.submission_attempts < 1 then null
      else false
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.track_staff_case_attempts() from public, anon, authenticated;
drop trigger if exists staff_case_attempt_tracking on public.staff_cases;
create trigger staff_case_attempt_tracking
  before update of status on public.staff_cases
  for each row
  execute function public.track_staff_case_attempts();

create table if not exists public.staff_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  case_id uuid references public.staff_cases(id) on delete set null,
  transaction_type text not null check (transaction_type in ('quality_bonus', 'penalty')),
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 1 and 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists staff_wallet_ledger_staff_created_idx
  on public.staff_wallet_ledger (staff_id, created_at desc);

alter table public.staff_wallet_ledger enable row level security;
revoke all on public.staff_wallet_ledger from public, anon, authenticated;
grant select on public.staff_wallet_ledger to authenticated;
grant all on public.staff_wallet_ledger to service_role;
drop policy if exists staff_wallet_ledger_read_own on public.staff_wallet_ledger;
create policy staff_wallet_ledger_read_own on public.staff_wallet_ledger
  for select to authenticated
  using (staff_id = auth.uid() or public.report_access_level() = 'super_admin');

create table if not exists public.staff_quality_notes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  case_id uuid references public.staff_cases(id) on delete set null,
  note_type text not null check (note_type in ('warning', 'appreciation')),
  note text not null check (length(trim(note)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists staff_quality_notes_staff_created_idx
  on public.staff_quality_notes (staff_id, created_at desc);

alter table public.staff_quality_notes enable row level security;
revoke all on public.staff_quality_notes from public, anon, authenticated;
grant select on public.staff_quality_notes to authenticated;
grant all on public.staff_quality_notes to service_role;
drop policy if exists staff_quality_notes_read_own on public.staff_quality_notes;
create policy staff_quality_notes_read_own on public.staff_quality_notes
  for select to authenticated
  using (staff_id = auth.uid() or public.report_access_level() = 'super_admin');

notify pgrst, 'reload schema';
commit;
