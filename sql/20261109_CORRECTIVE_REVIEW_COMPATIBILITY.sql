begin;
do $fix$
declare d text; anchor text := $anchor$elsif k in ('corrective.execute','corrective.manage','work_orders.manage') then$anchor$;
begin
 select pg_get_functiondef('public.bf_acl_legacy_can(uuid,text,uuid)'::regprocedure) into d;
 if strpos(d,'-- corrective review compatibility 20261109')=0 then
 if strpos(d,anchor)=0 then raise exception 'Unexpected legacy permission bridge'; end if;
 d:=replace(d,anchor,$review$elsif k in ('corrective.approve','corrective.review') then
 -- corrective review compatibility 20261109
 return public.bf_acl_has_permission(p_org,'medical.work_orders.review',p_user)
 or public.bf_acl_has_permission(p_org,'facilities.work_orders.review',p_user);
 $review$||anchor);
 execute d;
 end if;
 if public.bf_acl_legacy_can('25abee4e-0084-4c44-ab95-649392aea091','corrective.approve','85e1759d-52a4-4c1e-a797-0b4caaa8932a') is not true then raise exception 'Existing supervisor review grant not recognized'; end if;
end $fix$;
commit;
select 'PASS — existing corrective supervisor review permission recognized' as result;
