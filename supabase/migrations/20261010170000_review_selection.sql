begin;
alter table public.reviews add column if not exists user_selected boolean not null default false;
alter table public.reviews add column if not exists review_url text;
create or replace function public.save_selected_report(
  _scan_id uuid, _review_ids uuid[], _review_links jsonb, _metadata jsonb
) returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  owned_report uuid;
  selected_count integer;
begin
  select r.id into owned_report
  from public.reports r join public.scans s on s.id = r.scan_id
  where r.scan_id = _scan_id and r.user_id = auth.uid()
    and s.user_id = auth.uid() and s.status = 'complete' and not s.is_seed
  for update of r;
  if owned_report is null then raise exception 'Completed owned report not found'; end if;
  select count(*) into selected_count from public.reviews
    where scan_id = _scan_id and id = any(_review_ids);
  if cardinality(_review_ids) not between 1 and 5
     or selected_count <> cardinality(_review_ids) then
    raise exception 'Invalid selected reviews';
  end if;
  update public.reviews
    set user_selected = id = any(_review_ids),
        review_url = case when id = any(_review_ids)
          then _review_links ->> id::text else review_url end
    where scan_id = _scan_id;
  update public.reports
    set report_data = coalesce(report_data, '{}'::jsonb) ||
      jsonb_build_object(
        'selected_pdf_url', _metadata -> 'selected_pdf_url',
        'selected_saved_at', _metadata -> 'selected_saved_at',
        'selected_review_ids', to_jsonb(_review_ids),
        'selected_requests', _metadata -> 'selected_requests')
    where id = owned_report;
  return true;
end;
$$;
revoke all on function public.save_selected_report(uuid, uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.save_selected_report(uuid, uuid[], jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
