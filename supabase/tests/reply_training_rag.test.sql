begin;

select plan(6);

select ok(
  to_regclass('public.reply_training_data') is not null,
  'reply training table exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.reply_training_data'::regclass),
  'reply training rows are protected by row-level security'
);
select ok(
  not has_table_privilege('authenticated', 'public.reply_training_data', 'SELECT')
    and not has_table_privilege('anon', 'public.reply_training_data', 'SELECT'),
  'training examples cannot be read directly by clients'
);
select ok(
  to_regprocedure(
    'public.match_reply_training_data(extensions.vector,integer,text,integer)'
  ) is not null,
  'similarity search RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.match_reply_training_data(extensions.vector,integer,text,integer)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.match_reply_training_data(extensions.vector,integer,text,integer)',
      'EXECUTE'
    ),
  'similarity search is available to signed-in users only'
);
select ok(
  has_table_privilege('service_role', 'public.reply_training_data', 'INSERT')
    and has_table_privilege('service_role', 'public.reply_training_data', 'UPDATE'),
  'service role can seed and update training examples'
);

select * from finish();
rollback;
