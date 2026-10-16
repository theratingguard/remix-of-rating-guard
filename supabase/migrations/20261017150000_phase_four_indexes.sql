begin;

create index if not exists staff_email_idx
  on public.staff (email);

create index if not exists staff_cases_staff_assigned_idx
  on public.staff_cases (staff_id, assigned_at desc);

create index if not exists staff_cases_staff_status_deadline_idx
  on public.staff_cases (staff_id, status, deadline_at)
  where deadline_at is not null;

create index if not exists staff_cases_staff_status_priority_idx
  on public.staff_cases (staff_id, status, priority, assigned_at desc);

-- Existing indexes already cover the staff-scoped message and ledger queries.

commit;