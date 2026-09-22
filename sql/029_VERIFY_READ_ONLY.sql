select version,applied_at from public.bf_migrations where version=28;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('bf28_can','bf28_dashboard')
order by p.proname;
select code from public.bf_permissions where code='executive.view';
