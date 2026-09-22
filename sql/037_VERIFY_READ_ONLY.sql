select version,applied_at
from public.bf_migrations
where version=36;

select code,description
from public.bf_permissions
where code like 'organization-onboarding.%'
order by code;

select
  to_regprocedure('public.bf36_create_organization(text,text,text,text,text,text,text,text,text)') create_org,
  to_regprocedure('public.bf36_create_project_auto(uuid,uuid,uuid,text,date,date)') create_project_auto,
  to_regprocedure('public.bf36_create_team_auto(uuid,uuid,uuid,text,text,text)') create_team_auto,
  to_regprocedure('public.bf36_organization_directory()') organization_directory;

select count(*) organizations_without_code
from public.bf_organizations
where code is null or btrim(code)='';

select count(*) organizations_without_qr
from public.bf_organizations
where qr_token is null;

select count(*) contracts_without_system_code
from public.bf_contracts
where system_code is null or btrim(system_code)='';
