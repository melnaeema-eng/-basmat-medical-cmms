-- Run after migration 011 succeeds. All statements are read-only.
select version,applied_at from public.bf_migrations where version=10;
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('bf10_report','bf10_export','bf10_scopes')
order by p.proname;
select code from public.bf_permissions where code in('reports.view','reports.export') order by code;
select to_regclass('public.bf_work_orders') as work_orders,
 to_regclass('public.bf_ppm_jobs') as ppm_jobs,
 to_regclass('public.bf9_labor') as labor,
 to_regclass('public.bf8_material_events') as material_events;
-- No reporting tables or production data are created or modified by this check.
