
begin;

-- V7.3 — Technician evidence upload
-- Files live in private Supabase Storage.
-- Only storage paths + metadata are stored in PostgreSQL.
-- No permanent public URL is stored.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
 'maintenance-evidence',
 'maintenance-evidence',
 false,
 52428800,
 array[
  'image/jpeg','image/png','image/webp','image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 ]::text[]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.bf_maintenance_execution_attachments(
 id uuid primary key default gen_random_uuid(),
 package_id uuid not null references public.bf_maintenance_execution_packages(id) on delete cascade,
 organization_id uuid not null references public.bf_organizations(id),
 step_seq integer,
 result_id uuid references public.bf_maintenance_execution_results(id) on delete set null,
 bucket_id text not null default 'maintenance-evidence',
 object_path text not null,
 file_name text not null,
 mime_type text,
 size_bytes bigint check(size_bytes is null or size_bytes>=0),
 uploaded_by uuid not null references auth.users(id),
 uploaded_at timestamptz not null default now(),
 unique(bucket_id,object_path)
);

create index if not exists bf_exec_attach_pkg
on public.bf_maintenance_execution_attachments(package_id,step_seq,uploaded_at);

alter table public.bf_maintenance_execution_attachments enable row level security;

drop policy if exists bf_exec_attach_read on public.bf_maintenance_execution_attachments;
create policy bf_exec_attach_read
on public.bf_maintenance_execution_attachments
for select to authenticated
using(
 exists(
  select 1
  from public.bf_maintenance_execution_packages p
  where p.id=package_id
    and (
      p.technician_id=auth.uid()
      or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
      or public.bf_can(p.organization_id,'ppm.manage')
      or public.bf_can(p.organization_id,'medical.manage')
    )
 )
);

revoke all on public.bf_maintenance_execution_attachments from public,anon,authenticated;
grant select on public.bf_maintenance_execution_attachments to authenticated;

create or replace function public.bf_can_access_execution_package(p_package uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 select exists(
   select 1
   from public.bf_maintenance_execution_packages p
   where p.id=p_package
     and (
       p.technician_id=auth.uid()
       or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
       or public.bf_can(p.organization_id,'ppm.manage')
       or public.bf_can(p.organization_id,'medical.manage')
     )
 )
$$;

create or replace function public.bf_register_execution_attachment(
 p_package uuid,
 p_step_seq integer,
 p_object_path text,
 p_file_name text,
 p_mime_type text default null,
 p_size_bytes bigint default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 p public.bf_maintenance_execution_packages;
 v uuid;
 expected_prefix text;
begin
 select * into p
 from public.bf_maintenance_execution_packages
 where id=p_package;

 if not found then raise exception 'Execution package not found'; end if;

 if not(
   p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
   or public.bf_can(p.organization_id,'ppm.manage')
   or public.bf_can(p.organization_id,'medical.manage')
 ) then
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
end $$;

create or replace function public.bf_delete_execution_attachment(p_attachment uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
 a public.bf_maintenance_execution_attachments;
 p public.bf_maintenance_execution_packages;
begin
 select * into a from public.bf_maintenance_execution_attachments where id=p_attachment;
 if not found then raise exception 'Attachment not found'; end if;

 select * into p from public.bf_maintenance_execution_packages where id=a.package_id;
 if not found then raise exception 'Execution package not found'; end if;

 if not(
   p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
   or public.bf_can(p.organization_id,'ppm.manage')
   or public.bf_can(p.organization_id,'medical.manage')
 ) then
   raise exception 'Permission denied' using errcode='42501';
 end if;

 delete from public.bf_maintenance_execution_attachments where id=a.id;
 return a.object_path;
end $$;

revoke all on function public.bf_can_access_execution_package(uuid) from public,anon;
grant execute on function public.bf_can_access_execution_package(uuid) to authenticated;
revoke all on function public.bf_register_execution_attachment(uuid,integer,text,text,text,bigint) from public,anon;
grant execute on function public.bf_register_execution_attachment(uuid,integer,text,text,text,bigint) to authenticated;
revoke all on function public.bf_delete_execution_attachment(uuid) from public,anon;
grant execute on function public.bf_delete_execution_attachment(uuid) to authenticated;

-- Private Storage policies.
drop policy if exists bf_maintenance_evidence_insert on storage.objects;
create policy bf_maintenance_evidence_insert
on storage.objects
for insert to authenticated
with check(
 bucket_id='maintenance-evidence'
 and array_length(storage.foldername(name),1)>=3
 and exists(
   select 1
   from public.bf_maintenance_execution_packages p
   where p.organization_id::text=(storage.foldername(name))[1]
     and p.id::text=(storage.foldername(name))[2]
     and (
       p.technician_id=auth.uid()
       or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
       or public.bf_can(p.organization_id,'ppm.manage')
       or public.bf_can(p.organization_id,'medical.manage')
     )
 )
);

drop policy if exists bf_maintenance_evidence_select on storage.objects;
create policy bf_maintenance_evidence_select
on storage.objects
for select to authenticated
using(
 bucket_id='maintenance-evidence'
 and array_length(storage.foldername(name),1)>=3
 and exists(
   select 1
   from public.bf_maintenance_execution_packages p
   where p.organization_id::text=(storage.foldername(name))[1]
     and p.id::text=(storage.foldername(name))[2]
     and (
       p.technician_id=auth.uid()
       or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
       or public.bf_can(p.organization_id,'ppm.manage')
       or public.bf_can(p.organization_id,'medical.manage')
     )
 )
);

drop policy if exists bf_maintenance_evidence_delete on storage.objects;
create policy bf_maintenance_evidence_delete
on storage.objects
for delete to authenticated
using(
 bucket_id='maintenance-evidence'
 and array_length(storage.foldername(name),1)>=3
 and exists(
   select 1
   from public.bf_maintenance_execution_packages p
   where p.organization_id::text=(storage.foldername(name))[1]
     and p.id::text=(storage.foldername(name))[2]
     and (
       p.technician_id=auth.uid()
       or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
       or public.bf_can(p.organization_id,'ppm.manage')
       or public.bf_can(p.organization_id,'medical.manage')
     )
 )
);

-- Remove URL evidence requirement from the step RPC.
-- Photo evidence is now validated against uploaded attachment metadata.
create or replace function public.bf_submit_execution_step(
 p_package uuid,
 p_step_seq integer,
 p_result_text text default null,
 p_reading_value numeric default null,
 p_pass_fail text default null,
 p_photo_url text default null,
 p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 p public.bf_maintenance_execution_packages;
 st jsonb;
 v uuid;
 rtype text;
 required_photo boolean;
begin
 select * into p
 from public.bf_maintenance_execution_packages
 where id=p_package
 for update;

 if not found then raise exception 'Execution package not found'; end if;

 if not(
   p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 ) then
   raise exception 'Permission denied' using errcode='42501';
 end if;

 if p.status not in('assigned','started','blocked') then
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
end $$;

notify pgrst,'reload schema';
commit;
