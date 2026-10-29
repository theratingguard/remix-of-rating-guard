begin;

alter table public.profiles enable row level security;
alter table public.staff enable row level security;

grant select on public.profiles, public.staff to authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists staff_profile_read_own on public.staff;
create policy staff_profile_read_own on public.staff
  for select to authenticated
  using (id = (select auth.uid()));

notify pgrst, 'reload schema';
commit;
