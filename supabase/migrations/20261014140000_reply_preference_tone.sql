begin;

alter table public.auto_reply_preferences
  add column tone text not null default 'professional'
    check (tone in ('professional','friendly','formal','calm','apologetic','firm','short','detailed'));

alter table public.auto_replies
  drop constraint if exists auto_replies_tone_check;
alter table public.auto_replies
  add constraint auto_replies_tone_check
    check (tone in ('professional','friendly','formal','calm','apologetic','firm','short','detailed'));

commit;
