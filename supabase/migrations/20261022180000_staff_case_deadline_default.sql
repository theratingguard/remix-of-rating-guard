begin;

alter table public.staff_cases
  alter column deadline_at set default (now() + interval '24 hours');

commit;
