begin;

alter type public.app_role add value if not exists 'reseller';

create table public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('staff', 'client', 'reseller', 'superadmin', 'ai')),
  receiver_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 4000),
  is_read boolean not null default false,
  reply_to_id uuid unique references public.internal_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create index internal_messages_sender_created_idx on public.internal_messages (sender_id, created_at desc);
create index internal_messages_receiver_unread_idx on public.internal_messages (receiver_id, is_read, created_at desc);
create index internal_messages_conversation_idx on public.internal_messages (sender_id, receiver_id, created_at);

create table public.internal_chat_settings (
  id integer primary key check (id = 1),
  ai_auto_reply boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.internal_chat_settings (id) values (1) on conflict (id) do nothing;

create table public.internal_chat_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create index internal_chat_presence_last_seen_idx on public.internal_chat_presence (last_seen_at desc);

create table public.reseller_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique default ('RG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  mobile text unique check (mobile is null or length(trim(mobile)) between 6 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index reseller_mobile_digits_unique
  on public.reseller_profiles (regexp_replace(mobile, '[^0-9]', '', 'g'))
  where mobile is not null;

create table public.reseller_commissions (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.reseller_profiles(user_id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  amount_paise integer not null default 0 check (amount_paise >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reseller_commissions_owner_created_idx on public.reseller_commissions (reseller_id, created_at desc);

alter table public.internal_messages enable row level security;
alter table public.internal_chat_settings enable row level security;
alter table public.internal_chat_presence enable row level security;
alter table public.reseller_profiles enable row level security;
alter table public.reseller_commissions enable row level security;

create or replace function public.internal_chat_super_admin_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.user_id
  from public.report_principals p
  join auth.users u on u.id = p.user_id
  where p.access_level = 'super_admin'
    and lower(u.email) = 'theratingguard@gmail.com'
  limit 1
$$;

create or replace function public.internal_chat_contacts()
returns table(user_id uuid, email text, display_name text, role text, last_seen_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.report_access_level() <> 'super_admin' then
    raise exception 'Access denied';
  end if;
  return query
    select u.id,
      u.email::text,
      coalesce(nullif(s.name, ''), nullif(p.name, ''), u.email)::text,
      case when r.user_id is not null or u.raw_app_meta_data->>'role' = 'reseller' then 'reseller'
           when s.id is not null then 'staff'
           else 'client' end::text,
      pr.last_seen_at
    from auth.users u
    left join public.staff s on s.id = u.id
    left join public.profiles p on p.user_id = u.id
    left join public.reseller_profiles r on r.user_id = u.id
    left join public.internal_chat_presence pr on pr.user_id = u.id
    where u.id <> public.internal_chat_super_admin_id()
      and (
        s.id is not null
        or r.user_id is not null
        or u.raw_app_meta_data->>'role' in ('client', 'reseller')
      )
    order by coalesce(pr.last_seen_at, u.created_at) desc;
end
$$;

create or replace function public.ensure_reseller_profile()
returns setof public.reseller_profiles
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or (
    coalesce(auth.jwt()->'app_metadata'->>'role', '') <> 'reseller'
    and public.report_access_level() <> 'super_admin'
  ) then
    raise exception 'Reseller access required';
  end if;
  insert into public.reseller_profiles (user_id) values (auth.uid())
    on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role) values (auth.uid(), 'reseller')
    on conflict (user_id, role) do nothing;
  return query select * from public.reseller_profiles where user_id = auth.uid();
end
$$;

revoke all on function public.internal_chat_super_admin_id() from public, anon;
revoke all on function public.internal_chat_contacts() from public, anon, authenticated;
revoke all on function public.ensure_reseller_profile() from public, anon;
grant execute on function public.internal_chat_super_admin_id() to authenticated, service_role;
grant execute on function public.internal_chat_contacts() to authenticated, service_role;
grant execute on function public.ensure_reseller_profile() to authenticated, service_role;

revoke all on public.internal_messages, public.internal_chat_settings, public.internal_chat_presence,
  public.reseller_profiles, public.reseller_commissions from public, anon, authenticated;
grant select, insert on public.internal_messages to authenticated;
grant update (is_read) on public.internal_messages to authenticated;
grant select, update on public.internal_chat_settings to authenticated;
grant select, insert, update (last_seen_at) on public.internal_chat_presence to authenticated;
grant select, update (mobile, updated_at) on public.reseller_profiles to authenticated;
grant select, update (amount_paise, status, updated_at) on public.reseller_commissions to authenticated;
grant all on public.internal_messages, public.internal_chat_settings, public.internal_chat_presence,
  public.reseller_profiles, public.reseller_commissions to service_role;

create policy internal_messages_read_participant on public.internal_messages
  for select to authenticated
  using (
    public.report_access_level() = 'super_admin'
    or (
      (sender_id = auth.uid() or receiver_id = auth.uid())
      and (sender_id = public.internal_chat_super_admin_id()
        or receiver_id = public.internal_chat_super_admin_id())
    )
  );
create policy internal_messages_send on public.internal_messages
  for insert to authenticated
  with check (
    (
      public.report_access_level() = 'super_admin'
      and sender_id = auth.uid()
      and sender_role = 'superadmin'
      and receiver_id <> auth.uid()
      and (
        exists (select 1 from public.staff s where s.id = receiver_id)
        or exists (select 1 from public.reseller_profiles r where r.user_id = receiver_id)
        or exists (select 1 from auth.users u where u.id = receiver_id and u.raw_app_meta_data->>'role' = 'reseller')
        or exists (select 1 from auth.users u where u.id = receiver_id and u.raw_app_meta_data->>'role' = 'client')
      )
    )
    or (
      sender_id = auth.uid()
      and receiver_id = public.internal_chat_super_admin_id()
      and sender_role = case
        when exists (select 1 from public.staff s where s.id = auth.uid()) then 'staff'
        when auth.jwt()->'app_metadata'->>'role' = 'reseller' then 'reseller'
        when auth.jwt()->'app_metadata'->>'role' = 'client' then 'client'
        else ''
      end
    )
  );
create policy internal_messages_mark_received on public.internal_messages
  for update to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

create policy internal_chat_settings_super_admin_read on public.internal_chat_settings
  for select to authenticated using (public.report_access_level() = 'super_admin');
create policy internal_chat_settings_super_admin_update on public.internal_chat_settings
  for update to authenticated
  using (public.report_access_level() = 'super_admin')
  with check (public.report_access_level() = 'super_admin');

create policy internal_chat_presence_read on public.internal_chat_presence
  for select to authenticated
  using (user_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy internal_chat_presence_write_own on public.internal_chat_presence
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and last_seen_at <= now()
    and last_seen_at > now() - interval '2 minutes'
  );
create policy internal_chat_presence_update_own on public.internal_chat_presence
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and last_seen_at <= now()
    and last_seen_at > now() - interval '2 minutes'
  );

create policy reseller_profile_read on public.reseller_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy reseller_profile_update_mobile on public.reseller_profiles
  for update to authenticated
  using (user_id = auth.uid() and auth.jwt()->'app_metadata'->>'role' = 'reseller')
  with check (user_id = auth.uid() and auth.jwt()->'app_metadata'->>'role' = 'reseller');

create policy reseller_commission_read on public.reseller_commissions
  for select to authenticated
  using (reseller_id = auth.uid() or public.report_access_level() = 'super_admin');
create policy reseller_commission_super_admin_update on public.reseller_commissions
  for update to authenticated
  using (public.report_access_level() = 'super_admin')
  with check (public.report_access_level() = 'super_admin');

create or replace function public.record_reseller_referral()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  matching_reseller uuid;
  code text;
begin
  if new.email_confirmed_at is null
    or (tg_op = 'UPDATE' and old.email_confirmed_at is not null) then
    return new;
  end if;
  code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
  if code <> '' and new.raw_user_meta_data->>'account_type' = 'client' then
    select user_id into matching_reseller
    from public.reseller_profiles where referral_code = code;
    if matching_reseller is null or matching_reseller = new.id then
      raise exception 'Invalid reseller referral code';
    end if;
    update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"client"}'::jsonb
      where id = new.id;
    insert into public.reseller_commissions (reseller_id, referred_user_id)
      values (matching_reseller, new.id)
      on conflict (referred_user_id) do nothing;
  end if;
  return new;
end
$$;
revoke all on function public.record_reseller_referral() from public, anon, authenticated;
create trigger internal_chat_record_reseller_referral
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.record_reseller_referral();

notify pgrst, 'reload schema';
commit;
