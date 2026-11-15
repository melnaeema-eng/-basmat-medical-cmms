begin;
do $patch$
declare definition text;
begin
 select pg_get_functiondef('public.bf_acl_legacy_can(uuid,text,uuid)'::regprocedure) into definition;
 if position('Execution permissions are separate from administration' in definition)>0 then return; end if;
 if position('elsif k in (''corrective.execute'',''corrective.manage'',''work_orders.manage'') then' in definition)=0
 or position('elsif k in (''ppm.execute'',''ppm.manage'',''ppm.approve'') then' in definition)=0 then
  raise exception 'Unexpected live permission helper; no changes applied';
 end if;
 definition:=replace(definition,
 'elsif k in (''corrective.execute'',''corrective.manage'',''work_orders.manage'') then',
 '-- Execution permissions are separate from administration.
 elsif k = ''corrective.execute'' then
  return public.bf_acl_has_permission(p_org,''facilities.work_orders.execute'',p_user)
   or public.bf_acl_has_permission(p_org,''medical.work_orders.execute'',p_user)
   or public.bf_acl_has_permission(p_org,''facilities.work_orders.manage'',p_user)
   or public.bf_acl_has_permission(p_org,''medical.work_orders.manage'',p_user);
 elsif k in (''corrective.manage'',''work_orders.manage'') then');
 definition:=replace(definition,
 'elsif k in (''ppm.execute'',''ppm.manage'',''ppm.approve'') then',
 'elsif k = ''ppm.execute'' then
  return public.bf_acl_has_permission(p_org,''facilities.ppm.execute'',p_user)
   or public.bf_acl_has_permission(p_org,''medical.ppm.execute'',p_user)
   or public.bf_acl_has_permission(p_org,''facilities.ppm.manage'',p_user)
   or public.bf_acl_has_permission(p_org,''medical.ppm.manage'',p_user);
 elsif k in (''ppm.manage'',''ppm.approve'') then');
 execute definition;
end $patch$;
commit;