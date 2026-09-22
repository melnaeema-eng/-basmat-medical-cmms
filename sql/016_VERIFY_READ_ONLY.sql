select version,applied_at from public.bf_migrations where version=15;
select to_regclass('public.bf15_labor_rates') labor_rates,to_regclass('public.bf15_work_order_costs') work_order_costs;
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'bf15_%' order by proname;
select code from public.bf_permissions where code like 'costing.%' order by code;
