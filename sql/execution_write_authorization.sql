begin;
CREATE OR REPLACE FUNCTION public.bf_complete_execution_package(p_package uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.bf_maintenance_execution_packages; required_count integer; done_count integer; fail_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501';end if;
 select * into p from public.bf_maintenance_execution_packages where id=p_package for update;
 if not found then raise exception 'Execution package not found'; end if;
 if p.status<>'started' then raise exception 'Execution package is read-only in this status';end if;
 if not coalesce((p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 ),false) then raise exception 'Permission denied' using errcode='42501'; end if;

 select count(*) into required_count
 from jsonb_array_elements(p.procedure_snapshot->'steps') s
 where coalesce((s->>'required')::boolean,true);

 select count(*) into done_count
 from public.bf_maintenance_execution_results r
 where r.package_id=p.id
   and exists(
     select 1 from jsonb_array_elements(p.procedure_snapshot->'steps') s
     where (s->>'seq')::integer=r.step_seq
       and coalesce((s->>'required')::boolean,true)
   );

 if done_count<required_count then
   raise exception 'Complete all required procedure steps before closure';
 end if;

 select count(*) into fail_count
 from public.bf_maintenance_execution_results r
 where r.package_id=p.id and r.pass_fail='fail';

 if fail_count>0 and length(btrim(coalesce(p_note,'')))<5 then
   raise exception 'Failure/exception note is required before closure';
 end if;

 update public.bf_maintenance_execution_packages
 set status='completed',completed_at=now(),completion_note=nullif(btrim(p_note),''),updated_at=now()
 where id=p.id;
end $function$;
CREATE OR REPLACE FUNCTION public.bf_delete_execution_attachment(p_attachment uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 a public.bf_maintenance_execution_attachments;
 p public.bf_maintenance_execution_packages;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501';end if;
 select * into a from public.bf_maintenance_execution_attachments where id=p_attachment;
 if not found then raise exception 'Attachment not found'; end if;

 select * into p from public.bf_maintenance_execution_packages where id=a.package_id;
 if not found then raise exception 'Execution package not found'; end if;
 if p.status<>'started' then raise exception 'Execution package is read-only in this status';end if;

 if not coalesce((p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
   or public.bf_can(p.organization_id,'ppm.manage')
   or public.bf_can(p.organization_id,'medical.manage')
 ),false) then
   raise exception 'Permission denied' using errcode='42501';
 end if;

 delete from public.bf_maintenance_execution_attachments where id=a.id;
 return a.object_path;
end $function$;
CREATE OR REPLACE FUNCTION public.bf_register_execution_attachment(p_package uuid, p_step_seq integer, p_object_path text, p_file_name text, p_mime_type text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 p public.bf_maintenance_execution_packages;
 v uuid;
 expected_prefix text;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501';end if;
 select * into p
 from public.bf_maintenance_execution_packages
 where id=p_package;

 if not found then raise exception 'Execution package not found'; end if;
 if p.status<>'started' then raise exception 'Execution package is read-only in this status';end if;

 if not coalesce((p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
   or public.bf_can(p.organization_id,'ppm.manage')
   or public.bf_can(p.organization_id,'medical.manage')
 ),false) then
   raise exception 'Permission denied' using errcode='42501';
 end if;

 if p_step_seq is null or p_step_seq<=0 then
   raise exception 'Invalid step sequence';
 end if;

 if not exists(
   select 1
   from jsonb_array_elements(p.procedure_snapshot->'steps') s
   where (s->>'seq')::integer=p_step_seq
 ) then
   raise exception 'Procedure step not found';
 end if;

 expected_prefix:=p.organization_id::text||'/'||p.id::text||'/'||p_step_seq::text||'/';

 if p_object_path is null
    or left(p_object_path,length(expected_prefix))<>expected_prefix then
   raise exception 'Invalid storage object path';
 end if;

 insert into public.bf_maintenance_execution_attachments(
   package_id,organization_id,step_seq,bucket_id,object_path,
   file_name,mime_type,size_bytes,uploaded_by
 )
 values(
   p.id,p.organization_id,p_step_seq,'maintenance-evidence',p_object_path,
   left(coalesce(p_file_name,'file'),255),left(p_mime_type,150),p_size_bytes,auth.uid()
 )
 returning id into v;

 return v;
end $function$;
CREATE OR REPLACE FUNCTION public.bf_start_execution_package(p_package uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.bf_maintenance_execution_packages;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501';end if;
 select * into p from public.bf_maintenance_execution_packages where id=p_package for update;
 if not found then raise exception 'Execution package not found'; end if;
 if not coalesce((p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 ),false) then raise exception 'Permission denied' using errcode='42501'; end if;
 if p.status not in('assigned','blocked') then raise exception 'Package cannot be started'; end if;

 update public.bf_maintenance_execution_packages
 set status='started',started_at=coalesce(started_at,now()),updated_at=now()
 where id=p.id;
end $function$;
CREATE OR REPLACE FUNCTION public.bf_submit_execution_step(p_package uuid, p_step_seq integer, p_result_text text DEFAULT NULL::text, p_reading_value numeric DEFAULT NULL::numeric, p_pass_fail text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 p public.bf_maintenance_execution_packages;
 st jsonb;
 v uuid;
 rtype text;
 required_photo boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.bf_profiles where id=auth.uid() and status='active') then raise exception 'Authentication required' using errcode='42501';end if;
 select * into p
 from public.bf_maintenance_execution_packages
 where id=p_package
 for update;

 if not found then raise exception 'Execution package not found'; end if;

 if not coalesce((p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 ),false) then
   raise exception 'Permission denied' using errcode='42501';
 end if;

 if p.status<>'started' then
   raise exception 'Package is not executable';
 end if;

 select value into st
 from jsonb_array_elements(p.procedure_snapshot->'steps') value
 where (value->>'seq')::integer=p_step_seq
 limit 1;

 if st is null then raise exception 'Procedure step not found'; end if;

 rtype:=coalesce(st->>'response_type','pass_fail');
 required_photo:=coalesce((st->>'photo_required')::boolean,false);

 if rtype='pass_fail' and coalesce(p_pass_fail,'') not in('pass','fail','na') then
   raise exception 'Pass/fail result is required';
 elsif rtype='reading' and p_reading_value is null then
   raise exception 'Reading value is required';
 elsif rtype='text' and nullif(btrim(coalesce(p_result_text,'')),'') is null then
   raise exception 'Text result is required';
 end if;

 if required_photo and not exists(
   select 1
   from public.bf_maintenance_execution_attachments a
   where a.package_id=p.id and a.step_seq=p_step_seq
 ) then
   raise exception 'Photo/file evidence is required';
 end if;

 insert into public.bf_maintenance_execution_results(
   package_id,organization_id,step_seq,step_title_ar,step_title_en,response_type,
   result_text,reading_value,pass_fail,photo_url,notes,performed_by
 )
 values(
   p.id,p.organization_id,p_step_seq,st->>'title_ar',st->>'title_en',rtype,
   nullif(btrim(p_result_text),''),p_reading_value,p_pass_fail,null,
   nullif(btrim(p_notes),''),auth.uid()
 )
 on conflict(package_id,step_seq) do update
 set result_text=excluded.result_text,
     reading_value=excluded.reading_value,
     pass_fail=excluded.pass_fail,
     photo_url=null,
     notes=excluded.notes,
     performed_by=excluded.performed_by,
     performed_at=now()
 returning id into v;

 update public.bf_maintenance_execution_packages
 set status=case when status='assigned' then 'started' else status end,
     started_at=coalesce(started_at,now()),
     updated_at=now()
 where id=p.id;

 update public.bf_maintenance_execution_attachments
 set result_id=v
 where package_id=p.id
   and step_seq=p_step_seq
   and result_id is null;

 return v;
end $function$;
commit;

