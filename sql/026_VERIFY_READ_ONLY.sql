select version,applied_at from public.bf_migrations where version=25;
select to_regclass('public.bf25_meters') as meters,
       to_regclass('public.bf25_meter_readings') as meter_readings,
       to_regclass('public.bf25_events') as events;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('bf25_can','bf25_create_meter','bf25_add_reading','bf25_set_status','bf25_dashboard')
order by p.proname;
select code from public.bf_permissions where code like 'utilities.%' order by code;
