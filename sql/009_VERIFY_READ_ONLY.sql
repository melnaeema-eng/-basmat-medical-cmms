-- Read-only installation verification. Run only after 009 succeeds.
select version,applied_at from public.bf_migrations where version=8;
select to_regclass('public.bf8_material_requests') as requests,
 to_regclass('public.bf8_material_lines') as lines,
 to_regclass('public.bf8_allocations') as allocations,
 to_regclass('public.bf8_allocation_costs') as costs,
 to_regclass('public.bf8_material_events') as events,
 to_regclass('public.bf8_idempotency') as idempotency;
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'bf8_%' and c.relkind='r'
order by c.relname;
select count(*) as legacy_stock_rows from public.bf_inv_stock;
select count(*) as traceable_stock_rows from public.bf7_stock_lots;
-- Do not run any INSERT/UPDATE/DELETE while checking the release.
