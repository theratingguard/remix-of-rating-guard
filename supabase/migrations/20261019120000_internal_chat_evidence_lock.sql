begin;

alter table public.internal_messages
  add column is_locked boolean not null default true,
  add column deleted_by_superadmin boolean not null default false;
alter table public.internal_messages
  add constraint internal_messages_always_locked check (is_locked);

revoke insert on public.internal_messages from authenticated;
grant insert (sender_id, sender_role, receiver_id, message)
  on public.internal_messages to authenticated;

create table public.internal_message_audit (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.internal_messages(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('edited', 'removed')),
  previous_message text not null,
  replacement_message text,
  created_at timestamptz not null default now()
);
create index internal_message_audit_message_created_idx
  on public.internal_message_audit (message_id, created_at desc);
alter table public.internal_message_audit enable row level security;
revoke all on public.internal_message_audit from public, anon, authenticated;
grant select on public.internal_message_audit to authenticated;
grant all on public.internal_message_audit to service_role;
create policy internal_message_audit_super_admin_read on public.internal_message_audit
  for select to authenticated
  using (public.report_access_level() = 'super_admin');

drop policy internal_messages_read_participant on public.internal_messages;
create policy internal_messages_read_participant on public.internal_messages
  for select to authenticated
  using (
    public.report_access_level() = 'super_admin'
    or (
      not deleted_by_superadmin
      and (sender_id = auth.uid() or receiver_id = auth.uid())
      and (sender_id = public.internal_chat_super_admin_id()
        or receiver_id = public.internal_chat_super_admin_id())
    )
  );

create or replace function public.prevent_internal_message_hard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Evidence messages cannot be permanently deleted';
end
$$;
revoke all on function public.prevent_internal_message_hard_delete() from public, anon, authenticated;
create trigger internal_messages_no_hard_delete
  before delete on public.internal_messages
  for each row execute function public.prevent_internal_message_hard_delete();

create or replace function public.admin_edit_internal_message(_message_id uuid, _replacement text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare current_message public.internal_messages%rowtype;
begin
  if auth.uid() is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  if _replacement is null or length(trim(_replacement)) not between 1 and 4000 then
    raise exception 'Message must contain 1 to 4000 characters';
  end if;
  select * into current_message
    from public.internal_messages
    where id = _message_id
    for update;
  if not found then raise exception 'Message not found'; end if;
  if current_message.deleted_by_superadmin then
    raise exception 'A removed message cannot be edited';
  end if;
  insert into public.internal_message_audit (
    message_id, actor_id, action, previous_message, replacement_message
  ) values (
    current_message.id, auth.uid(), 'edited', current_message.message, trim(_replacement)
  );
  update public.internal_messages
    set message = trim(_replacement), is_locked = true
    where id = current_message.id;
  return current_message.id;
end
$$;

create or replace function public.admin_remove_internal_message(_message_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare current_message public.internal_messages%rowtype;
begin
  if auth.uid() is null or public.report_access_level() <> 'super_admin' then
    raise exception 'Superadmin access required';
  end if;
  select * into current_message
    from public.internal_messages
    where id = _message_id
    for update;
  if not found then raise exception 'Message not found'; end if;
  if current_message.deleted_by_superadmin then
    raise exception 'Message has already been removed';
  end if;
  insert into public.internal_message_audit (
    message_id, actor_id, action, previous_message
  ) values (
    current_message.id, auth.uid(), 'removed', current_message.message
  );
  update public.internal_messages
    set deleted_by_superadmin = true, is_locked = true
    where id = current_message.id;
  return current_message.id;
end
$$;

revoke all on function public.admin_edit_internal_message(uuid, text) from public, anon;
revoke all on function public.admin_remove_internal_message(uuid) from public, anon;
grant execute on function public.admin_edit_internal_message(uuid, text) to authenticated, service_role;
grant execute on function public.admin_remove_internal_message(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
