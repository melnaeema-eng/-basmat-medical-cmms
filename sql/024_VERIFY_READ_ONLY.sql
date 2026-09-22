select version,applied_at from public.bf_migrations where version=23;
select to_regclass('public.bf23_obligations') as obligations,
       to_regclass('public.bf23_inspection_records') as inspection_records;
select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('bf23_can','bf23_create_obligation','bf23_record_result','bf23_archive_obligation','bf23_dashboard')
order by p.proname;
select code from public.bf_permissions where code like 'compliance.%' order by code;
