-- Sprint 9 read-only installation check. Run after migration 010 succeeds.
select version,applied_at from public.bf_migrations where version=9;
select to_regclass('public.bf9_visits') as visits,
 to_regclass('public.bf9_labor') as labor,
 to_regclass('public.bf9_evidence') as evidence,
 to_regclass('public.bf9_events') as events,
 to_regclass('public.bf9_requirements') as requirements;
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'bf9_%' and c.relkind='r'
order by c.relname;
select id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='bf9-evidence';
select count(*) as work_orders from public.bf_work_orders;
select count(*) as visits from public.bf9_visits;
select count(*) as labor_records from public.bf9_labor;
-- No INSERT, UPDATE, DELETE, or migration reruns are needed for verification.
