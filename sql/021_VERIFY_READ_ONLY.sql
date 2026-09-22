select version,applied_at from public.bf_migrations where version=20;
select to_regclass('public.bf20_dispatch_slots') as dispatch_slots;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('bf20_can','bf20_schedule','bf20_reschedule','bf20_cancel','bf20_complete','bf20_board')
order by p.proname;
select code from public.bf_permissions where code like 'workforce.%' order by code;
