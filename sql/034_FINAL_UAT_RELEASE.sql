-- Basmat Facilities CMMS — Sprint 33
-- Final UAT & Production Release Readiness
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=32)
 then raise exception 'Install and verify Sprint 32 first'; end if;
 if exists(select 1 from public.bf_migrations where version=33)
 then raise exception 'Sprint 33 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description)
values ('release.view','View final UAT and production release readiness')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where p.code='release.view'
  and r.code='company_admin'
on conflict do nothing;

create or replace function public.bf33_release_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 result jsonb;
begin
 if auth.uid() is null then
   raise exception 'Authentication required' using errcode='42501';
 end if;

 if not public.bf_is_super_admin()
 and not exists(
   select 1
   from public.bf_user_roles ur
   join public.bf_roles r on r.id=ur.role_id
   where ur.user_id=auth.uid()
     and r.code='company_admin'
     and public.bf4_staff(ur.organization_id,'release.view')
 )
 then
   raise exception 'Company admin permission required' using errcode='42501';
 end if;

 with expected(v) as (
  select generate_series(1,33)
 ),
 missing_migrations as (
  select e.v
  from expected e
  left join public.bf_migrations m on m.version=e.v
  where m.version is null
 ),
 required_functions(name) as (
  values
   ('bf29_portal'),
   ('bf30_center'),
   ('bf31_workspace'),
   ('bf32_security_readiness'),
   ('bf33_release_readiness')
 ),
 missing_functions as (
  select rf.name
  from required_functions rf
  where not exists(
   select 1
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname=rf.name
  )
 ),
 required_permissions(code) as (
  values
   ('contract-renewal.view'),
   ('contract-renewal.manage'),
   ('executive.view'),
   ('document-control.view'),
   ('document-control.manage'),
   ('mobile-field.view'),
   ('security.view'),
   ('release.view')
 ),
 missing_permissions as (
  select rp.code
  from required_permissions rp
  left join public.bf_permissions p on p.code=rp.code
  where p.id is null
 ),
 required_tables(name) as (
  values
   ('bf_clients'),
   ('bf_sites'),
   ('bf_assets'),
   ('bf_work_orders'),
   ('bf9_visits'),
   ('bf13_documents'),
   ('bf25_meters'),
   ('bf27_renewal_tracking'),
   ('bf30_documents'),
   ('bf30_revisions')
 ),
 missing_tables as (
  select rt.name
  from required_tables rt
  where to_regclass('public.'||rt.name) is null
 ),
 checks as (
  select jsonb_build_array(
   jsonb_build_object(
    'key','migration_chain',
    'label','Migration chain 1–33',
    'status',case when not exists(select 1 from missing_migrations) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(v order by v) from missing_migrations),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','functions',
    'label','Required final functions',
    'status',case when not exists(select 1 from missing_functions) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(name order by name) from missing_functions),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','permissions',
    'label','Required final permissions',
    'status',case when not exists(select 1 from missing_permissions) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(code order by code) from missing_permissions),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','tables',
    'label','Required operational tables',
    'status',case when not exists(select 1 from missing_tables) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(name order by name) from missing_tables),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','security',
    'label','Security readiness installed',
    'status',case when to_regprocedure('public.bf32_security_readiness()') is not null then 'pass' else 'fail' end,
    'detail',jsonb_build_object('function','bf32_security_readiness')
   ),
   jsonb_build_object(
    'key','release_access',
    'label','Release readiness restricted to company admin',
    'status',case when exists(
      select 1
      from public.bf_role_permissions rp
      join public.bf_roles r on r.id=rp.role_id
      join public.bf_permissions p on p.id=rp.permission_id
      where p.code='release.view'
        and r.code='company_admin'
    ) then 'pass' else 'fail' end,
    'detail',jsonb_build_object('permission','release.view')
   )
  ) payload
 )
 select jsonb_build_object(
   'checks',(select payload from checks),
   'summary',jsonb_build_object(
     'pass',(select count(*) from jsonb_array_elements((select payload from checks)) x where x->>'status'='pass'),
     'fail',(select count(*) from jsonb_array_elements((select payload from checks)) x where x->>'status'='fail')
   ),
   'release_manifest',jsonb_build_object(
     'product','Basmat Facilities CMMS',
     'release','Sprint 33 Final UAT & Production Release Readiness',
     'database_marker',33,
     'frontend_route','/release-readiness'
   ),
   'uat_checklist',jsonb_build_array(
     'Admin login and role permissions',
     'Client/Owner portal access and service request submission',
     'Corrective work order lifecycle',
     'PPM workflow and approvals',
     'Field visit start/finish, labor and evidence',
     'Procurement and stock workflows',
     'Contract renewal and SLA dashboard',
     'Executive dashboard',
     'Document Control and revision workflow',
     'Mobile field workflow',
     'Security readiness page shows no failed checks',
     'Arabic RTL and English LTR navigation',
     'Cloudflare production environment variables',
     'Supabase Auth redirect URLs and MFA policy',
     'Database backup and rollback procedure'
   ),
   'deployment_steps',jsonb_build_array(
     'Run final local npm build',
     'Commit and push reviewed source to main',
     'Confirm Cloudflare Pages deployment succeeds',
     'Run 034_VERIFY_READ_ONLY.sql on production',
     'Open production /release-readiness and confirm no failed checks',
     'Complete business UAT sign-off'
   )
 ) into result;

 return result;
end $$;

revoke all on function public.bf33_release_readiness() from public,anon;
grant execute on function public.bf33_release_readiness() to authenticated;

insert into public.bf_migrations(version) values(33);

commit;
