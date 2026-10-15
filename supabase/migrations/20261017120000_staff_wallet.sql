begin;

alter table public.staff
  add column if not exists credits integer not null default 0
  check (credits >= 0);

alter table public.staff
  add column if not exists live_status text not null default 'Offline'
  check (live_status in ('Available', 'Working', 'Offline'));

create table if not exists public.staff_credits (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  case_id uuid not null references public.staff_cases(id) on delete restrict,
  amount integer not null check (amount > 0),
  reason text not null,
  created_at timestamptz not null default now(),
  constraint staff_credits_case_unique unique (case_id)
);

create index if not exists staff_credits_staff_created_idx
  on public.staff_credits (staff_id, created_at desc);

alter table public.staff_credits enable row level security;
revoke all on public.staff_credits from public, anon, authenticated;
grant select on public.staff_credits to authenticated;
grant all on public.staff_credits to service_role;

drop policy if exists staff_credits_read_own on public.staff_credits;
create policy staff_credits_read_own on public.staff_credits
  for select to authenticated
  using (staff_id = auth.uid() or public.report_access_level() = 'super_admin');

create or replace function public.credit_staff_on_removed_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from 'closed'
    and new.status = 'closed'
    and new.ai_status = 'removed'
    and new.staff_id is not null
  then
    insert into public.staff_credits (staff_id, case_id, amount, reason)
    values (new.staff_id, new.id, 1, 'Review removal confirmed on closed case')
    on conflict (case_id) do nothing;

    if found then
      update public.staff
      set credits = credits + 1,
          updated_at = now()
      where id = new.staff_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.credit_staff_on_removed_case() from public, anon, authenticated;

drop trigger if exists staff_case_removed_credit on public.staff_cases;
create trigger staff_case_removed_credit
  after update of status on public.staff_cases
  for each row
  execute function public.credit_staff_on_removed_case();

notify pgrst, 'reload schema';
commit;
