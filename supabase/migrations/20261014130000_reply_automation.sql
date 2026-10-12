begin;
alter table public.auto_replies
  add column source text not null default 'manual'
    check (source in ('manual','automatic'));
create index auto_replies_automatic_lookup_idx
  on public.auto_replies(user_id, review_id) where source = 'automatic';

create table public.auto_reply_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.auto_reply_preferences enable row level security;
revoke all on public.auto_reply_preferences from anon, authenticated;
grant select, insert, update on public.auto_reply_preferences to authenticated;
grant all on public.auto_reply_preferences to service_role;
create policy auto_reply_preferences_owner_access on public.auto_reply_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke delete on public.auto_reply_preferences from authenticated;
commit;
