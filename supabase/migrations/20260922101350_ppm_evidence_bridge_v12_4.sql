-- Basmat Medical CMMS — V12.4
-- PPM Evidence Bridge
-- Purpose:
--   Keep the existing maintenance-evidence upload flow, but mirror confirmed
--   execution attachments into bf53_ppm_evidence so the PPM completion guard
--   can see required photo evidence.
--
-- Safe / idempotent:
--   - No table drops
--   - No guard bypass
--   - Existing photo requirement stays enabled
--   - Existing attachments are backfilled
--   - Future attachments are mirrored automatically

begin;

create or replace function public.bf54_sync_execution_attachment_to_ppm_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg public.bf_maintenance_execution_packages%rowtype;
  v_job public.bf_ppm_jobs%rowtype;
  v_step_id uuid;
  v_uploaded_by uuid;
begin
  select *
    into v_pkg
  from public.bf_maintenance_execution_packages
  where id = new.package_id;

  if not found
     or v_pkg.source_job_type <> 'facility_ppm'
     or v_pkg.source_job_id is null then
    return new;
  end if;

  select *
    into v_job
  from public.bf_ppm_jobs
  where id = v_pkg.source_job_id;

  if not found then
    return new;
  end if;

  select nullif(s->>'id','')::uuid
    into v_step_id
  from jsonb_array_elements(coalesce(v_job.procedure_snapshot->'steps','[]'::jsonb)) s
  where coalesce((s->>'seq')::integer,0) = new.step_seq
  limit 1;

  -- If sequence matching is unavailable, do not create a misleading record.
  if v_step_id is null then
    return new;
  end if;

  v_uploaded_by := coalesce(auth.uid(), v_pkg.technician_id, v_job.assigned_to);

  if v_uploaded_by is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.bf53_ppm_evidence e
    where e.job_id = v_job.id
      and e.step_id = v_step_id
      and e.object_path = new.object_path
  ) then
    insert into public.bf53_ppm_evidence(
      organization_id,
      job_id,
      step_id,
      uploaded_by,
      file_name,
      object_path,
      mime_type,
      file_size,
      caption,
      status,
      verified_at
    )
    values(
      v_job.organization_id,
      v_job.id,
      v_step_id,
      v_uploaded_by,
      coalesce(nullif(new.file_name,''),'ppm-evidence'),
      new.object_path,
      coalesce(nullif(new.mime_type,''),'application/octet-stream'),
      coalesce(new.size_bytes,0),
      'Synced from maintenance execution evidence',
      'ready',
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists bf54_sync_execution_attachment_to_ppm_evidence
on public.bf_maintenance_execution_attachments;

create trigger bf54_sync_execution_attachment_to_ppm_evidence
after insert on public.bf_maintenance_execution_attachments
for each row
execute function public.bf54_sync_execution_attachment_to_ppm_evidence();

-- Backfill existing attachments for all facility PPM execution packages.
insert into public.bf53_ppm_evidence(
  organization_id,
  job_id,
  step_id,
  uploaded_by,
  file_name,
  object_path,
  mime_type,
  file_size,
  caption,
  status,
  verified_at
)
select
  j.organization_id,
  j.id,
  (s->>'id')::uuid,
  coalesce(p.technician_id,j.assigned_to),
  coalesce(nullif(a.file_name,''),'ppm-evidence'),
  a.object_path,
  coalesce(nullif(a.mime_type,''),'application/octet-stream'),
  coalesce(a.size_bytes,0),
  'Backfilled from maintenance execution evidence',
  'ready',
  now()
from public.bf_maintenance_execution_attachments a
join public.bf_maintenance_execution_packages p
  on p.id = a.package_id
join public.bf_ppm_jobs j
  on j.id = p.source_job_id
cross join lateral jsonb_array_elements(
  coalesce(j.procedure_snapshot->'steps','[]'::jsonb)
) s
where p.source_job_type = 'facility_ppm'
  and coalesce((s->>'seq')::integer,0) = a.step_seq
  and coalesce(p.technician_id,j.assigned_to) is not null
  and not exists (
    select 1
    from public.bf53_ppm_evidence e
    where e.job_id = j.id
      and e.step_id = (s->>'id')::uuid
      and e.object_path = a.object_path
  );

notify pgrst, 'reload schema';

commit;

-- Verification for the current PPM job.
select
  e.job_id,
  e.step_id,
  e.file_name,
  e.status,
  e.object_path,
  e.verified_at
from public.bf53_ppm_evidence e
where e.job_id = 'f2e1585e-a039-43a4-8391-17a4c018b011'
order by e.created_at;
