begin;
do $fix$
declare d text; marker text := 'AND pm.code=p_permission'; u uuid := 'd8bd6bd6-52eb-41c8-8eaf-0db08d0dc607'; o uuid := '25abee4e-0084-4c44-ab95-649392aea091';
begin
 select pg_get_functiondef('public.bf4_user_can(uuid,uuid,text)'::regprocedure) into d;
 if position('-- medical execution compatibility 20261109' in d)=0 then
 if position(marker in d)=0 then raise exception 'Unexpected helper definition'; end if;
 d:=replace(d,marker,$replacement$AND (
 pm.code=p_permission
 OR (
 -- medical execution compatibility 20261109
 r.is_active IS TRUE
 AND ((p_permission='corrective.execute' AND pm.code='medical.work_orders.execute')
 OR (p_permission='ppm.execute' AND pm.code='medical.ppm.execute'))
 AND public.bf_acl_has_permission(p_org,pm.code,p_user)
 )
 )$replacement$);
 execute d;
 end if;
 if not public.bf4_user_can(u,o,'ppm.execute') or not public.bf4_user_can(u,o,'corrective.execute') then raise exception 'Execution compatibility check failed'; end if;
 if public.bf4_user_can(gen_random_uuid(),o,'ppm.execute') then raise exception 'Unknown user must be denied'; end if;
end $fix$;
commit;
select 'PASS — existing medical execution grants recognized; no roles or memberships added' as result;