-- Basmat Facilities CMMS — Sprint 32
-- Security Readiness & Production Hardening
begin;

do $$
begin
 if not exists(select 1 from public.bf_migrations where version=31)
 then raise exception 'Install and verify Sprint 31 first'; end if;
 if exists(select 1 from public.bf_migrations where version=32)
 then raise exception 'Sprint 32 already installed'; end if;
end $$;

insert into public.bf_permissions(code,description)
values ('security.view','View security readiness and production hardening status')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where p.code='security.view' and r.code='company_admin'
on conflict do nothing;

create or replace function public.bf32_security_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;

 if not exists(
   select 1
   from public.bf_user_roles ur
   join public.bf_roles r on r.id=ur.role_id
   where ur.user_id=auth.uid()
     and r.code='company_admin'
     and public.bf4_staff(ur.organization_id,'security.view')
 )
 and not exists(select 1 from public.bf_profiles p where p.id=auth.uid() and p.is_super_admin=true)
 then raise exception 'Company admin permission required' using errcode='42501'; end if;

 with app_tables as (
  select c.oid,n.nspname,c.relname,c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='r'
    and c.relname like 'bf%'
 ),
 rls_stats as (
  select
   count(*)::int total,
   count(*) filter(where relrowsecurity)::int enabled,
   count(*) filter(where not relrowsecurity)::int disabled
  from app_tables
 ),
 unsafe_definer as (
  select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) arguments
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname like 'bf%'
    and p.prosecdef=true
    and (
      p.proconfig is null
      or not exists(
        select 1 from unnest(p.proconfig) cfg
        where cfg='search_path=""'
           or cfg='search_path='
           or cfg like 'search_path=%'
      )
    )
 ),
 anon_exec as (
  select p.proname,pg_get_function_identity_arguments(p.oid) arguments
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname like 'bf%'
    and has_function_privilege('anon',p.oid,'EXECUTE')
 ),
 anon_table_write as (
  select table_name,privilege_type
  from information_schema.role_table_grants
  where grantee='anon'
    and table_schema='public'
    and table_name like 'bf%'
    and privilege_type in('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
 ),
 orphan_roles as (
  select ur.user_id,ur.organization_id,ur.role_id
  from public.bf_user_roles ur
  left join public.bf_profiles p on p.id=ur.user_id
  left join public.bf_roles r on r.id=ur.role_id
  where p.id is null or r.id is null
 ),
 inactive_memberships as (
  select ur.user_id,ur.organization_id,r.code role_code
  from public.bf_user_roles ur
  join public.bf_profiles p on p.id=ur.user_id
  join public.bf_roles r on r.id=ur.role_id
  where p.status<>'active'
 ),
 duplicate_permissions as (
  select code,count(*) qty
  from public.bf_permissions
  group by code
  having count(*)>1
 ),
 migrations as (
  select coalesce(max(version),0)::int latest,count(*)::int applied
  from public.bf_migrations
 ),
 checks as (
  select jsonb_build_array(
   jsonb_build_object(
    'key','rls',
    'label','RLS enabled on bf* tables',
    'status',case when (select disabled from rls_stats)=0 then 'pass' else 'fail' end,
    'detail',jsonb_build_object('total',(select total from rls_stats),'enabled',(select enabled from rls_stats),'disabled',(select disabled from rls_stats))
   ),
   jsonb_build_object(
    'key','security_definer_search_path',
    'label','SECURITY DEFINER search_path hardened',
    'status',case when not exists(select 1 from unsafe_definer) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(to_jsonb(x)) from unsafe_definer x),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','anon_function_execute',
    'label','No anon EXECUTE on bf* functions',
    'status',case when not exists(select 1 from anon_exec) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(to_jsonb(x)) from anon_exec x),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','anon_table_write',
    'label','No anon write grants on bf* tables',
    'status',case when not exists(select 1 from anon_table_write) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(to_jsonb(x)) from anon_table_write x),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','orphan_roles',
    'label','No orphan user-role memberships',
    'status',case when not exists(select 1 from orphan_roles) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(to_jsonb(x)) from orphan_roles x),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','inactive_memberships',
    'label','No inactive users with active memberships',
    'status',case when not exists(select 1 from inactive_memberships) then 'pass' else 'warn' end,
    'detail',coalesce((select jsonb_agg(to_jsonb(x)) from inactive_memberships x),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','duplicate_permissions',
    'label','Permission codes are unique',
    'status',case when not exists(select 1 from duplicate_permissions) then 'pass' else 'fail' end,
    'detail',coalesce((select jsonb_agg(to_jsonb(x)) from duplicate_permissions x),'[]'::jsonb)
   ),
   jsonb_build_object(
    'key','migration_state',
    'label','Migration chain current',
    'status',case when (select latest from migrations)>=32 then 'pass' else 'warn' end,
    'detail',(select to_jsonb(x) from migrations x)
   )
  ) payload
 )
 select jsonb_build_object(
   'checks',(select payload from checks),
   'summary',jsonb_build_object(
     'pass',(
       select count(*) from jsonb_array_elements((select payload from checks)) x
       where x->>'status'='pass'
     ),
     'warn',(
       select count(*) from jsonb_array_elements((select payload from checks)) x
       where x->>'status'='warn'
     ),
     'fail',(
       select count(*) from jsonb_array_elements((select payload from checks)) x
       where x->>'status'='fail'
     )
   ),
   'production_checklist',jsonb_build_array(
     'Enable MFA/2FA for privileged admin accounts in Supabase Auth',
     'Confirm production redirect URLs and disable unused development URLs',
     'Keep service-role keys out of browser and Cloudflare public variables',
     'Verify database backups and recovery procedure',
     'Review Cloudflare environment variables and access controls',
     'Run final role-permission UAT before production release'
   )
 ) into result;

 return result;
end $$;

revoke all on function public.bf32_security_readiness() from public,anon;
grant execute on function public.bf32_security_readiness() to authenticated;

insert into public.bf_migrations(version) values(32);
commit;
