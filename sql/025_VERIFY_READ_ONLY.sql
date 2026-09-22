select version,applied_at from public.bf_migrations where version=24;
select to_regclass('public.bf24_permits') as permits,
       to_regclass('public.bf24_controls') as controls,
       to_regclass('public.bf24_events') as events;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('bf24_can','bf24_create','bf24_add_control','bf24_verify_control','bf24_action','bf24_dashboard','bf24_detail')
order by p.proname;
select code from public.bf_permissions where code like 'permit.%' order by code;
