begin;

create index if not exists removal_outcomes_scan_submitted_idx
  on public.removal_outcomes (scan_id, submitted_at desc);

commit;
