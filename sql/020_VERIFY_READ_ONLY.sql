select version,applied_at from public.bf_migrations where version=19;
select to_regclass('public.bf19_supplier_evaluations') as supplier_evaluations;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('bf19_can','bf19_evaluate','bf19_dashboard')
order by p.proname;
select code from public.bf_permissions where code like 'supplier-performance.%' order by code;
