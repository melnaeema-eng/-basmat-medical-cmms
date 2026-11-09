begin;
do $policy$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='bf_maintenance_execution_packages' and policyname='bf_execution_assigned_technician_read') then
 execute $sql$create policy bf_execution_assigned_technician_read on public.bf_maintenance_execution_packages for select to authenticated using (
 technician_id=auth.uid()
 and (public.bf4_user_can(auth.uid(),organization_id,'ppm.execute') or public.bf4_user_can(auth.uid(),organization_id,'corrective.execute'))
 )$sql$;
 end if;
end $policy$;
select set_config('request.jwt.claim.sub','d8bd6bd6-52eb-41c8-8eaf-0db08d0dc607',true);
set local role authenticated;
do $verify$
begin
 if not exists(select 1 from public.bf_maintenance_execution_packages where id='f385ed48-5402-4800-b463-36cd46782389' and technician_id=auth.uid()) then raise exception 'Assigned package remains hidden'; end if;
 if exists(select 1 from public.bf_maintenance_execution_packages where technician_id<>auth.uid()) then raise exception 'Another technician package became visible'; end if;
end $verify$;
commit;
select 'PASS — assigned execution package visible; other technicians packages remain hidden' as result;