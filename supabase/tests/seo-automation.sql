do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'seo_worker_runs',
    'seo_audit_issues',
    'seo_content_drafts',
    'seo_meta_suggestions',
    'seo_link_suggestions',
    'seo_leads',
    'seo_search_keywords'
  ]
  loop
    if not exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = required_table
    ) then
      raise exception 'Missing SEO automation table: %', required_table;
    end if;
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = required_table and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on SEO automation table: %', required_table;
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = required_table
        and policyname = required_table || '_admin_only'
        and qual like '%report_access_level%'
        and with_check like '%report_access_level%'
    ) then
      raise exception 'Superadmin-only policy is missing on SEO automation table: %', required_table;
    end if;
  end loop;
end
$$;
