begin;

update public.profiles
set language = 'en'
where language not in ('en', 'hi', 'sw', 'zu', 'af', 'am', 'ha');

alter table public.profiles
  add constraint profiles_supported_language_check
  check (language in ('en', 'hi', 'sw', 'zu', 'af', 'am', 'ha'));

alter table public.internal_messages
  add column original_message text,
  add column translated_message text,
  add column original_language text,
  add column translated_language text;

update public.internal_messages
set original_message = message,
    translated_message = message,
    original_language = 'en',
    translated_language = 'en';

alter table public.internal_messages
  alter column original_message set not null,
  alter column translated_message set not null,
  alter column original_language set not null,
  alter column translated_language set not null,
  add constraint internal_messages_supported_original_language_check
    check (original_language in ('en', 'hi', 'sw', 'zu', 'af', 'am', 'ha')),
  add constraint internal_messages_supported_translated_language_check
    check (translated_language in ('en', 'hi', 'sw', 'zu', 'af', 'am', 'ha')),
  add constraint internal_messages_original_text_length_check
    check (length(trim(original_message)) between 1 and 4000),
  add constraint internal_messages_translated_text_length_check
    check (length(trim(translated_message)) between 1 and 4000);

revoke insert on public.internal_messages from authenticated;
revoke insert (sender_id, sender_role, receiver_id, message)
  on public.internal_messages from authenticated;

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
    set message = trim(_replacement),
        original_message = trim(_replacement),
        translated_message = trim(_replacement),
        original_language = 'en',
        translated_language = 'en',
        is_locked = true
    where id = current_message.id;
  return current_message.id;
end
$$;

revoke all on function public.admin_edit_internal_message(uuid, text) from public, anon;
grant execute on function public.admin_edit_internal_message(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
