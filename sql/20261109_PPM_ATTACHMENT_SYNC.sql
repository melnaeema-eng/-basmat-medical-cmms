begin;
CREATE OR REPLACE FUNCTION public.bf54_sync_execution_attachment_to_ppm_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
 pkg jsonb; v_job_id uuid; v_org_id uuid; v_step_id uuid; uploader uuid;
begin
 if to_regclass('public.bf53_ppm_evidence') is null then return new; end if;
 select to_jsonb(p) into pkg from public.bf_maintenance_execution_packages p where p.id=new.package_id;
 if pkg is null or coalesce(pkg->>'source_job_type','')<>'facility_ppm' or nullif(pkg->>'source_job_id','') is null then return new; end if;
 v_job_id:=(pkg->>'source_job_id')::uuid;
 v_org_id:=nullif(pkg->>'organization_id','')::uuid;
 uploader:=coalesce(nullif(to_jsonb(new)->>'uploaded_by','')::uuid,auth.uid());
 select (s->>'id')::uuid into v_step_id from public.bf_ppm_jobs j
 cross join lateral jsonb_array_elements(coalesce(j.procedure_snapshot->'steps','[]'::jsonb)) s
 where j.id=v_job_id and coalesce((s->>'seq')::int,0)=coalesce((to_jsonb(new)->>'step_seq')::int,0) limit 1;
 if v_step_id is null then return new; end if;
 if not exists(select 1 from public.bf53_ppm_evidence e where e.job_id=v_job_id and e.step_id=v_step_id and e.object_path=to_jsonb(new)->>'object_path') then
 insert into public.bf53_ppm_evidence(organization_id,job_id,step_id,uploaded_by,file_name,object_path,mime_type,file_size,caption,status)
 values(v_org_id,v_job_id,v_step_id,uploader,coalesce(to_jsonb(new)->>'file_name','evidence'),to_jsonb(new)->>'object_path',nullif(to_jsonb(new)->>'mime_type',''),nullif(to_jsonb(new)->>'size_bytes','')::bigint,'','ready');
 end if;
 return new;
end $function$;
savepoint evidence_check;
select set_config('request.jwt.claim.sub','d8bd6bd6-52eb-41c8-8eaf-0db08d0dc607',true);
set local role authenticated;
select public.bf_register_execution_attachment('f385ed48-5402-4800-b463-36cd46782389',1,'25abee4e-0084-4c44-ab95-649392aea091/f385ed48-5402-4800-b463-36cd46782389/1/TEST-ONLY-migration-check.jpg','TEST ONLY migration check.jpg','image/jpeg',1);
rollback to savepoint evidence_check;
commit;
select 'PASS — attachment synchronization tested; temporary verification attachment rolled back' as result;