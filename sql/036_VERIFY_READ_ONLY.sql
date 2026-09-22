select version,applied_at from public.bf_migrations where version=35;

select to_regclass('public.bf35_service_lines') service_lines,
       to_regclass('public.bf35_projects') projects,
       to_regclass('public.bf35_project_sites') project_sites,
       to_regclass('public.bf35_teams') teams,
       to_regclass('public.bf35_team_members') team_members;

select p.proname,pg_get_function_identity_arguments(p.oid) arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and p.proname in(
 'bf35_seed_service_lines','bf35_create_project','bf35_link_site',
 'bf35_create_team','bf35_add_team_member','bf35_structure'
)
order by p.proname;

select code from public.bf_permissions
where code like 'enterprise-structure.%'
order by code;
