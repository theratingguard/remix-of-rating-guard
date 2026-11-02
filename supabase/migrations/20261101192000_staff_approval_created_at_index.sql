begin;

create index if not exists staff_created_at_desc_idx
  on public.staff (created_at desc);

create index if not exists staff_activity_action_created_at_idx
  on public.staff_activity_log (action, created_at desc);

commit;
