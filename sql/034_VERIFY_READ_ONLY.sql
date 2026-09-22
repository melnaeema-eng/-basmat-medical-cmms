select version,applied_at
from public.bf_migrations
where version=33;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='bf33_release_readiness';

select code
from public.bf_permissions
where code='release.view';
