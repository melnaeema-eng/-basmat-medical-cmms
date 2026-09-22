select version,applied_at
from public.bf_migrations
where version=38;

select code
from public.bf_permissions
where code in('governance.view','governance.manage')
order by code;

select count(*) role_levels
from public.bf38_role_levels;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in(
 'bf38_role_matrix','bf38_permission_anomalies',
 'bf38_scope_anomalies','bf38_repair_missing_views'
)
order by p.proname;
