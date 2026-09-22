select version,applied_at from public.bf_migrations where version=14;
select to_regclass('public.bf14_asset_inspections') as inspections,
       to_regclass('public.bf14_warranty_claims') as warranty_claims,
       to_regclass('public.bf14_replacement_plans') as replacement_plans;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in('bf14_center','bf14_inspect','bf14_claim','bf14_plan','bf14_can')
order by p.proname;
select code from public.bf_permissions where code like 'lifecycle.%' order by code;
