select version,applied_at from public.bf_migrations where version=27;
select to_regclass('public.bf27_renewal_tracking') as renewal_tracking;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('bf27_can','bf27_update_renewal','bf27_dashboard')
order by p.proname;
select code from public.bf_permissions where code like 'contract-renewal.%' order by code;
