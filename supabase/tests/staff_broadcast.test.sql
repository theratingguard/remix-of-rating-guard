begin;

select plan(11);

select ok(
  to_regclass('public.notifications') is not null,
  'staff notification table exists'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.notifications'::regclass),
  'staff notifications enforce row-level security'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_read_own'
      and qual ilike '%auth.uid%'
      and qual ilike '%user_id%'
  ),
  'staff can read only their own notifications'
);
select ok(
  not has_table_privilege('authenticated', 'public.notifications', 'INSERT')
    and not has_table_privilege('authenticated', 'public.notifications', 'DELETE')
    and has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE'),
  'authenticated users can only mark notifications read'
);
select ok(
  has_function_privilege('authenticated', 'public.broadcast_staff_options()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.broadcast_staff_options()', 'EXECUTE'),
  'broadcast audience options require authentication'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.broadcast_staff(text,text,text,uuid,text,text,boolean)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.broadcast_staff(text,text,text,uuid,text,text,boolean)',
      'EXECUTE'
    ),
  'broadcast execution is restricted to authenticated users'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure)
    and pg_get_functiondef(
      'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
    ) ilike '%report_access_level%'
    and pg_get_functiondef(
      'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
    ) ilike '%specific_team%',
  'broadcast validates admin or manager access and audience scope'
);
select ok(
  pg_get_functiondef(
    'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
  ) ilike '%5000%'
    and pg_get_functiondef(
      'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
    ) ilike '%inactive_recipients%',
  'broadcast limits recipients and reports active and inactive counts'
);
select ok(
  pg_get_functiondef(
    'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
  ) ilike '%not coalesce(_create_task, false)%'
    and pg_get_functiondef(
      'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
    ) ilike '%staff.status in%',
  'announcements reach inactive staff while task assignments require active staff'
);
select ok(
  pg_get_functiondef(
    'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
  ) ilike '%insert into public.tasks%'
    and pg_get_functiondef(
      'public.broadcast_staff(text,text,text,uuid,text,text,boolean)'::regprocedure
    ) ilike '%insert into public.notifications%',
  'broadcast creates task assignments and one notification per recipient'
);
select ok(
  pg_get_functiondef('public.guard_hierarchy_task_write()'::regprocedure)
    ilike '%app.broadcast_staff%',
  'bulk assignments use the guarded broadcast transaction context'
);

select * from finish();
rollback;
