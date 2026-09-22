select version,applied_at from public.bf_migrations where version=31;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('bf31_workspace','bf31_asset_lookup')
order by p.proname;
select code from public.bf_permissions where code='mobile-field.view';
