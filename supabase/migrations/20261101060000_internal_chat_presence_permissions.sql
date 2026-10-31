begin;

alter table public.internal_chat_presence enable row level security;

revoke all on table public.internal_chat_presence from public, anon, authenticated;
grant select on table public.internal_chat_presence to authenticated;
grant all on table public.internal_chat_presence to service_role;

drop policy if exists internal_chat_presence_read on public.internal_chat_presence;
create policy internal_chat_presence_read on public.internal_chat_presence
  for select to authenticated
  using (user_id = auth.uid() or public.report_access_level() = 'super_admin');

drop policy if exists internal_chat_presence_write_own on public.internal_chat_presence;
drop policy if exists internal_chat_presence_update_own on public.internal_chat_presence;

create or replace function public.touch_internal_chat_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.internal_chat_presence (user_id, last_seen_at)
  values (auth.uid(), clock_timestamp())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at;
end
$$;

revoke all on function public.touch_internal_chat_presence() from public, anon;
grant execute on function public.touch_internal_chat_presence() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
