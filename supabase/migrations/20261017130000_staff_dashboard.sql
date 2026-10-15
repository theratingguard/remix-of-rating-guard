begin;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.staff'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '(^|[^a-z_])status([^a-z_]|$)'
  loop
    execute format('alter table public.staff drop constraint %I', constraint_row.conname);
  end loop;

  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.staff_cases'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '(^|[^a-z_])status([^a-z_]|$)'
  loop
    execute format('alter table public.staff_cases drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

alter table public.staff
  add constraint staff_status_dashboard_check
  check (status in ('pending', 'approved', 'rejected', 'active', 'disabled'));

alter table public.staff_cases
  add constraint staff_cases_status_dashboard_check
  check (status in (
    'open', 'accepted', 'in_progress', 'submitted', 'approved',
    'rejected', 'rework', 'completed', 'reply_received', 'closed'
  ));

alter table public.staff
  add column if not exists role text not null default 'Case Handler',
  add column if not exists team_lead text,
  add column if not exists skills text[] not null default '{}';

alter table public.staff_cases
  add column if not exists priority text not null default 'Normal'
    check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  add column if not exists deadline_at timestamptz,
  add column if not exists staff_decision_reason text,
  add column if not exists tl_remarks text,
  add column if not exists rework_instructions text,
  add column if not exists mistake_category text;

create table if not exists public.staff_payout_details (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  method text not null check (method in ('upi', 'bank', 'binance')),
  upi_id text,
  bank_name text,
  bank_holder text,
  bank_account_last4 text check (bank_account_last4 is null or bank_account_last4 ~ '^[0-9]{4}$'),
  binance_pay_id text,
  updated_at timestamptz not null default now(),
  constraint staff_payout_details_method_data_check check (
    (method <> 'upi' or nullif(trim(upi_id), '') is not null)
    and (method <> 'bank' or (
      nullif(trim(bank_name), '') is not null
      and nullif(trim(bank_holder), '') is not null
      and bank_account_last4 is not null
    ))
    and (method <> 'binance' or nullif(trim(binance_pay_id), '') is not null)
  )
);

alter table public.staff_payout_details enable row level security;
revoke all on public.staff_payout_details from public, anon, authenticated;
grant select on public.staff_payout_details to authenticated;
grant all on public.staff_payout_details to service_role;
drop policy if exists staff_payout_details_read_own on public.staff_payout_details;
create policy staff_payout_details_read_own on public.staff_payout_details
  for select to authenticated
  using (staff_id = auth.uid() or public.report_access_level() = 'super_admin');

create table if not exists public.staff_admin_messages (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('staff', 'admin')),
  message text not null check (length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists staff_admin_messages_thread_idx
  on public.staff_admin_messages (staff_id, created_at, id);

alter table public.staff_admin_messages enable row level security;
revoke all on public.staff_admin_messages from public, anon, authenticated;
grant select on public.staff_admin_messages to authenticated;
grant all on public.staff_admin_messages to service_role;
drop policy if exists staff_admin_messages_read_own on public.staff_admin_messages;
create policy staff_admin_messages_read_own on public.staff_admin_messages
  for select to authenticated
  using (staff_id = auth.uid() or public.report_access_level() = 'super_admin');

notify pgrst, 'reload schema';
commit;
