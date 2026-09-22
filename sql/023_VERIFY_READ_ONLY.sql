select version,applied_at from public.bf_migrations where version=22;
select to_regclass('public.bf22_downtime_incidents') as downtime_incidents;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('bf22_can','bf22_open','bf22_close','bf22_cancel','bf22_dashboard')
order by p.proname;
select code from public.bf_permissions where code like 'reliability.%' order by code;
