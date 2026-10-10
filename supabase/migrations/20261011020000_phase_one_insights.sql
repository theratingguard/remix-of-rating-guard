begin;
create view public.removal_history with (security_invoker=true) as
select id, review_id, policy_type, business_type,
  case when jsonb_typeof(evidence_used->'evidence_strength')='number'
    and (evidence_used->>'evidence_strength')::numeric between 0 and 100
    then (evidence_used->>'evidence_strength')::integer else null end as evidence_strength,
  outcome, floor(extract(epoch from (response_at-submitted_at))/86400)::integer as days_to_response,
  response_at as created_at
from public.removal_outcomes where outcome in ('approved','rejected') and response_at is not null;
revoke all on public.removal_history from public,anon;
grant select on public.removal_history to authenticated,service_role;

create function public.smart_alerts_sample() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if public.report_access_level()<>'super_admin' then raise exception 'Access Denied: Super Admin insights only'; end if;
  with latest as (
    select distinct on (coalesce(s.business_id::text,s.id::text))
      s.id, s.business_id, s.business_name, s.created_at
    from public.scans s where s.status='complete' and not s.is_seed
      and s.created_at>=now()-interval '7 days'
    order by coalesce(s.business_id::text,s.id::text),s.created_at desc,s.id desc
  ), sample as (
    select r.id,r.author,r.rating,r.text,r.published_at,r.scan_id,
      l.business_name,l.business_id,l.created_at as fetched_at,a.risk,a.category,b.category as business_type
    from latest l join public.reviews r on r.scan_id=l.id
    left join public.review_analyses a on a.review_id=r.id
    left join public.businesses b on b.id=l.business_id
  )
  select jsonb_build_object(
    'generated_at',now(),'since',now()-interval '7 days',
    'reviews',coalesce((select jsonb_agg(to_jsonb(sample)) from sample),'[]'::jsonb),
    'outcomes',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'outcome',o.outcome))
      from public.removal_outcomes o where o.submitted_at>=now()-interval '7 days'),'[]'::jsonb),
    'approved_this_week',(select count(*) from public.removal_outcomes o
      where o.outcome='approved' and o.response_at>=now()-interval '7 days'),
    'rejected_this_week',(select count(*) from public.removal_outcomes o
      where o.outcome='rejected' and o.response_at>=now()-interval '7 days')
  ) into result;
  return result;
end $$;
revoke all on function public.smart_alerts_sample() from public,anon;
grant execute on function public.smart_alerts_sample() to authenticated;
notify pgrst,'reload schema';
commit;
