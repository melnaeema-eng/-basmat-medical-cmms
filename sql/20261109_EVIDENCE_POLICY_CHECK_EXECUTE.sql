begin;
grant execute on function public.bf44_can_manage(uuid,uuid,uuid,uuid) to authenticated;
select set_config('request.jwt.claim.sub','85e1759d-52a4-4c1e-a797-0b4caaa8932a',true);
set local role authenticated;
do $verify$
begin
 if public.bf44_can_manage('25abee4e-0084-4c44-ab95-649392aea091',null,null,null) is true then raise exception 'Unexpected commercial management access'; end if;
end $verify$;
commit;
select 'PASS — storage policy can call its permission checker; no commercial access granted to omer' as result;