begin;

alter table public.removal_outcomes
  add constraint removal_outcomes_scan_owner_fk
  foreign key (scan_id, user_id)
  references public.scans (id, user_id);

alter table public.review_removal_orders
  add constraint review_removal_orders_scan_owner_fk
  foreign key (scan_id, client_id)
  references public.scans (id, user_id);

create index payout_requests_reseller_status_idx
  on public.payout_requests (reseller_id, status);

create index reseller_commissions_payout_request_id_idx
  on public.reseller_commissions (payout_request_id);

create index call_log_case_created_idx
  on public.call_log (review_tracking_id, created_at desc);

create index email_log_case_created_idx
  on public.email_log (review_tracking_id, created_at desc);

notify pgrst, 'reload schema';
commit;
