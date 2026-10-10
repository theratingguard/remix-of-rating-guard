begin;
alter table public.scan_history add column if not exists report_url text;
notify pgrst, 'reload schema';
commit;
