select version,applied_at from public.bf_migrations where version=26;
select to_regclass('public.bf26_incidents') as incidents,
       to_regclass('public.bf26_actions') as corrective_actions,
       to_regclass('public.bf26_events') as events;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('bf26_can','bf26_create_incident','bf26_add_action','bf26_complete_action',
                   'bf26_update_investigation','bf26_close_incident','bf26_dashboard','bf26_detail')
order by p.proname;
select code from public.bf_permissions where code like 'hse.%' order by code;
