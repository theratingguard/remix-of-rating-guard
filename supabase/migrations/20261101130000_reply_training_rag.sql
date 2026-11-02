begin;

create extension if not exists vector with schema extensions;

create table public.reply_training_data (
  id uuid primary key default gen_random_uuid(),
  seed_key text not null unique,
  question text not null check (length(trim(question)) between 1 and 4000),
  answer text not null check (length(trim(answer)) between 1 and 2000),
  rating_band smallint not null check (rating_band between 1 and 5),
  industry text not null check (length(trim(industry)) between 1 and 100),
  issue_type text not null check (
    issue_type in ('praise', 'timing', 'price', 'staff', 'quality', 'spam')
  ),
  embedding extensions.vector(768),
  created_at timestamptz not null default now()
);

create index reply_training_data_embedding_hnsw_idx
  on public.reply_training_data
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

alter table public.reply_training_data enable row level security;
revoke all on public.reply_training_data from public, anon, authenticated;
grant all on public.reply_training_data to service_role;

create or replace function public.match_reply_training_data(
  query_embedding extensions.vector(768),
  query_rating integer,
  query_industry text,
  match_count integer default 3
)
returns table (
  question text,
  answer text,
  rating_band smallint,
  industry text,
  issue_type text,
  similarity real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  if query_embedding is null
     or query_rating not between 1 and 5
     or length(trim(coalesce(query_industry, ''))) = 0 then
    raise exception 'A review embedding, rating, and industry are required';
  end if;

  return query
  select
    training.question,
    training.answer,
    training.rating_band,
    training.industry,
    training.issue_type,
    (1 - (training.embedding operator(extensions.<=>) query_embedding))::real
  from public.reply_training_data training
  where training.embedding is not null
  order by
    (training.embedding operator(extensions.<=>) query_embedding)
      + case when lower(training.industry) = lower(trim(query_industry)) then 0 else 0.04 end
      + abs(training.rating_band - query_rating) * 0.015,
    training.id
  limit least(greatest(coalesce(match_count, 3), 1), 10);
end
$$;

revoke all on function public.match_reply_training_data(
  extensions.vector, integer, text, integer
) from public, anon;
grant execute on function public.match_reply_training_data(
  extensions.vector, integer, text, integer
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
