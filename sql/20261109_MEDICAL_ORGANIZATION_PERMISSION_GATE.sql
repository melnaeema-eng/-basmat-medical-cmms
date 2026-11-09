-- Applied and verified in the MEDICAL project on 2026-11-09.
-- Company module and permission gates only; no global ACL helper or role changes.
begin;
do $repair$
declare
 v_org uuid := '25abee4e-0084-4c44-ab95-649392aea091';
 v_user uuid;
 v_key text;
begin
 select id into strict v_user from public.bf_profiles where lower(email)='melnaeem@gmail.com' and status='active';
 if public.bf_acl_home_org(v_user) is distinct from v_org then raise exception 'Company mismatch'; end if;
 if exists(select 1 from public.bf_acl_organization_permissions where organization_id=v_org and permission_key like 'facilities.%' and is_allowed) then raise exception 'Unexpected facilities grants; review required'; end if;
 update public.bf_acl_organization_modules set is_enabled=true where organization_id=v_org and module_code in ('medical','shared');
 insert into public.bf_acl_organization_modules(organization_id,module_code,is_enabled)
 select v_org,m,true from (values ('medical'),('shared')) x(m)
 where not exists(select 1 from public.bf_acl_organization_modules a where a.organization_id=v_org and a.module_code=x.m);
 for v_key in
 select distinct rp.permission_key from public.bf_acl_user_roles ur
 join public.bf_acl_roles r on r.id=ur.role_id and r.is_active
 join public.bf_acl_role_permissions rp on rp.role_id=r.id and rp.is_allowed
 join public.bf_acl_permissions p on p.permission_key=rp.permission_key and p.is_active
 where ur.user_id=v_user and ur.organization_id=v_org and ur.is_active
 and (ur.valid_from is null or ur.valid_from<=current_date)
 and (ur.valid_until is null or ur.valid_until>=current_date)
 and (p.module_code='medical' or rp.permission_key in ('projects.view','contracts.view','reports.view','reports.export','documents.view','documents.generate','documents.manage','procurement.view','procurement.request','procurement.manage','procurement.approve','corrective.request'))
 loop
 update public.bf_acl_organization_permissions set is_allowed=true where organization_id=v_org and permission_key=v_key;
 insert into public.bf_acl_organization_permissions(organization_id,permission_key,is_allowed)
 select v_org,v_key,true where not exists(select 1 from public.bf_acl_organization_permissions where organization_id=v_org and permission_key=v_key);
 end loop;
 foreach v_key in array array['medical.assets.view','medical.work_orders.view','medical.work_orders.execute','medical.ppm.view','medical.ppm.execute','documents.view','procurement.view'] loop
 if public.bf_acl_has_permission(v_org,v_key,v_user) is not true then raise exception 'Verification failed: %',v_key; end if;
 end loop;
 foreach v_key in array array['corrective.view','corrective.execute','ppm.view','ppm.execute'] loop
 if public.bf_acl_legacy_can(v_org,v_key,v_user) is not true then raise exception 'Legacy verification failed: %',v_key; end if;
 end loop;
 if public.bf_acl_has_permission(v_org,'facilities.work_orders.view',v_user) or public.bf_acl_has_permission(v_org,'facilities.ppm.execute',v_user) then raise exception 'Facilities isolation check failed'; end if;
end $repair$;
commit;
select 'PASS — Medical access and execution enabled; facilities access denied; existing user roles preserved' as result;