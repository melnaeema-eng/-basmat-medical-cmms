begin;
do $fix$
declare d text; old_check text := 'if not public.bf_med_rebuild_can_manage(v_org) then';
begin
 select pg_get_functiondef('public.bf_med_asset_operational_context(uuid)'::regprocedure) into d;
 if position(old_check in d)=0 then raise exception 'Unexpected context definition; no change'; end if;
 d := replace(d,old_check,$predicate$if not (
 public.bf_med_rebuild_can_manage(v_org)
 or (coalesce(public.bf_acl_has_permission(v_org,'medical.assets.view',auth.uid()),false)
 and coalesce(public.bf_acl_has_permission(v_org,'medical.work_orders.view',auth.uid()),false)
 and coalesce(public.bf_acl_has_permission(v_org,'medical.ppm.view',auth.uid()),false))
 ) then$predicate$);
 execute d;
end $fix$;
select set_config('request.jwt.claim.sub',(select id::text from public.bf_profiles where lower(email)='melnaeem@gmail.com' and status='active'),true);
do $verify$
declare a uuid; payload jsonb;
begin
 select id into strict a from public.bf_assets where organization_id='25abee4e-0084-4c44-ab95-649392aea091' and asset_tag='AST-000018';
 payload := public.bf_med_asset_operational_context(a);
 if payload is null or not (payload ? 'overview') then raise exception 'Context verification failed'; end if;
end $verify$;
commit;
select 'PASS — omer can read the medical device context; mutation permissions unchanged' as result;