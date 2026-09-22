select version,applied_at from public.bf_migrations where version=18;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='bf18_calendar';

select code from public.bf_permissions where code='planning.view';
