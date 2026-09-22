select version,applied_at
from public.bf_migrations
where version=37;

select code
from public.bf_permissions
where code in('soft-fm.view','soft-fm.manage','soft-fm.execute')
order by code;

select
 to_regclass('public.bf37_task_templates') task_templates,
 to_regclass('public.bf37_tasks') tasks,
 to_regclass('public.bf37_task_events') task_events;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in('bf37_seed_templates','bf37_create_task','bf37_action','bf37_dashboard')
order by p.proname;
