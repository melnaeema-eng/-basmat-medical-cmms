
begin;

-- V7.2
-- Backfill execution packages for jobs that were already assigned before V7
-- and tighten direct access to internal package-build functions.

create or replace function public.bf_backfill_execution_packages()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 r record;
 facility_created integer:=0;
 medical_created integer:=0;
 skipped integer:=0;
 v uuid;
begin
 if auth.uid() is not null and not public.bf_is_super_admin() then
   raise exception 'Super Admin required' using errcode='42501';
 end if;

 -- Existing assigned Facilities PPM jobs.
 for r in
   select j.id
   from public.bf_ppm_jobs j
   where j.assigned_to is not null
     and not exists(
       select 1
       from public.bf_maintenance_execution_packages p
       where p.domain='facilities' and p.source_job_id=j.id
     )
 loop
   begin
     v:=public.bf_build_facility_execution_package(r.id);
     if v is not null then
       facility_created:=facility_created+1;
     else
       skipped:=skipped+1;
     end if;
   exception when others then
     skipped:=skipped+1;
   end;
 end loop;

 -- Existing assigned Medical work orders.
 if to_regclass('public.bf_med_work_orders') is not null then
   for r in
     select w.id
     from public.bf_med_work_orders w
     where w.assigned_to is not null
       and not exists(
         select 1
         from public.bf_maintenance_execution_packages p
         where p.domain='medical' and p.source_job_id=w.id
       )
   loop
     begin
       v:=public.bf_build_medical_execution_package(r.id);
       if v is not null then
         medical_created:=medical_created+1;
       else
         skipped:=skipped+1;
       end if;
     exception when others then
       skipped:=skipped+1;
     end;
   end loop;
 end if;

 return jsonb_build_object(
   'facility_packages_created',facility_created,
   'medical_packages_created',medical_created,
   'skipped',skipped
 );
end $$;

-- Internal builders should not be callable directly by ordinary authenticated users.
revoke all on function public.bf_build_facility_execution_package(uuid) from public,anon,authenticated;
revoke all on function public.bf_build_medical_execution_package(uuid) from public,anon,authenticated;

-- The explicit backfill function is Super-Admin only by its own guard.
revoke all on function public.bf_backfill_execution_packages() from public,anon;
grant execute on function public.bf_backfill_execution_packages() to authenticated;

-- Backfill once during migration.
do $$
declare
 r record;
begin
 for r in
   select j.id
   from public.bf_ppm_jobs j
   where j.assigned_to is not null
     and not exists(
       select 1 from public.bf_maintenance_execution_packages p
       where p.domain='facilities' and p.source_job_id=j.id
     )
 loop
   begin
     perform public.bf_build_facility_execution_package(r.id);
   exception when others then
     null;
   end;
 end loop;

 if to_regclass('public.bf_med_work_orders') is not null then
   for r in
     select w.id
     from public.bf_med_work_orders w
     where w.assigned_to is not null
       and not exists(
         select 1 from public.bf_maintenance_execution_packages p
         where p.domain='medical' and p.source_job_id=w.id
       )
   loop
     begin
       perform public.bf_build_medical_execution_package(r.id);
     exception when others then
       null;
     end;
   end loop;
 end if;
end $$;

notify pgrst,'reload schema';
commit;
