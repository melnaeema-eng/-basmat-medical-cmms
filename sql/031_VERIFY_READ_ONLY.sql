select version,applied_at from public.bf_migrations where version=30;
select to_regclass('public.bf30_documents') as documents,
       to_regclass('public.bf30_revisions') as revisions;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in('bf30_can_view','bf30_create_document','bf30_add_revision','bf30_archive_document','bf30_center','bf30_detail')
order by p.proname;
select code from public.bf_permissions where code like 'document-control.%' order by code;
