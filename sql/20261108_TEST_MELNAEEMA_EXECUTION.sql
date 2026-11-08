-- User-authorized test execution grant. No global role templates are changed.
-- Apply to the MEDICAL project's SQL Editor, not the facilities project.
begin;
do $grant$
declare
  v_user uuid;
  v_org uuid;
  v_role uuid;
begin
  select id into strict v_user from public.bf_profiles
  where lower(email)='melnaeema@gmail.com' and status='active';
  select id into strict v_org from public.bf_organizations
  where code='ORG-0001' and name='شركة بصمة النوابغ';

  if not exists(select 1 from public.bf_user_roles where user_id=v_user and organization_id=v_org) then
    raise exception 'Existing company membership required; no membership will be invented';
  end if;

  insert into public.bf_permissions(code,description) values
    ('corrective.execute','Execute assigned work orders'),
    ('ppm.execute','Execute assigned preventive maintenance')
  on conflict(code) do nothing;

  insert into public.bf_roles(organization_id,name,code,is_system)
  values(v_org,'TEST ONLY — melnaeema medical execution','test_medical_exec_melnaeema',false)
  on conflict(organization_id,code) do nothing;

  select id into strict v_role from public.bf_roles
  where organization_id=v_org and code='test_medical_exec_melnaeema';

  insert into public.bf_role_permissions(role_id,permission_id)
  select v_role,id from public.bf_permissions
  where code in ('corrective.execute','ppm.execute')
  on conflict do nothing;

  insert into public.bf_user_roles(user_id,organization_id,role_id)
  values(v_user,v_org,v_role) on conflict do nothing;

  if not public.bf4_user_can(v_user,v_org,'corrective.execute')
     or not public.bf4_user_can(v_user,v_org,'ppm.execute') then
    raise exception 'Execution check still fails: transaction rolled back; inspect the live permission helper';
  end if;
end
$grant$;
commit;

select 'PASS — melnaeema execution enabled in ORG-0001 only' as result;
