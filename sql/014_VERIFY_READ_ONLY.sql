select version,applied_at from public.bf_migrations where version=13;
select to_regclass('public.bf13_documents') as documents;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('bf13_can_view','bf13_generate','bf13_void','bf13_center')
order by p.proname;
select code from public.bf_permissions where code like 'documents.%' order by code;
