
begin;

-- ============================================================
-- Basmat Facilities CMMS V7
-- Maintenance Knowledge Engine
-- One execution model for Facilities + Medical libraries.
-- OEM/vendor procedures may be stored and prioritized, while
-- generic baselines remain clearly identified as non-OEM.
-- ============================================================

insert into public.bf_permissions(code,description) values
 ('maintenance.execute','Execute assigned maintenance procedures and checklists'),
 ('maintenance.knowledge.manage','Manage maintenance knowledge, procedure sources and approvals')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r
cross join public.bf_permissions p
where
 (r.code in('company_admin','facility_manager','maintenance_manager') and p.code in('maintenance.execute','maintenance.knowledge.manage'))
 or (r.code in('supervisor','technician') and p.code='maintenance.execute')
on conflict do nothing;

-- ---------------- Facilities master library metadata ----------------
alter table public.bf_master_ppm_templates
 add column if not exists model_family text,
 add column if not exists source_type text not null default 'generic',
 add column if not exists source_name text,
 add column if not exists source_document text,
 add column if not exists source_revision text,
 add column if not exists source_url text,
 add column if not exists verified_at timestamptz,
 add column if not exists verified_by uuid,
 add column if not exists required_skill text,
 add column if not exists required_personnel integer not null default 1,
 add column if not exists required_tools text,
 add column if not exists required_test_equipment text,
 add column if not exists required_ppe text,
 add column if not exists required_consumables text,
 add column if not exists prerequisites text,
 add column if not exists shutdown_required boolean not null default false,
 add column if not exists loto_required boolean not null default false,
 add column if not exists permit_required boolean not null default false,
 add column if not exists frequency_basis text not null default 'calendar',
 add column if not exists interval_value numeric,
 add column if not exists interval_unit text,
 add column if not exists meter_type text,
 add column if not exists meter_interval numeric,
 add column if not exists environment_notes text,
 add column if not exists procedure_priority integer not null default 10;

do $$ begin
 if not exists(
   select 1 from pg_constraint
   where conname='bf_master_ppm_templates_source_type_ck'
 ) then
   alter table public.bf_master_ppm_templates
   add constraint bf_master_ppm_templates_source_type_ck
   check(source_type in('generic','oem','vendor','contract','internal','regulatory'));
 end if;
 if not exists(
   select 1 from pg_constraint
   where conname='bf_master_ppm_templates_frequency_basis_ck'
 ) then
   alter table public.bf_master_ppm_templates
   add constraint bf_master_ppm_templates_frequency_basis_ck
   check(frequency_basis in('calendar','runtime','both','condition'));
 end if;
end $$;

alter table public.bf_master_ppm_steps
 add column if not exists required boolean not null default true,
 add column if not exists min_value numeric,
 add column if not exists max_value numeric,
 add column if not exists acceptance_text text,
 add column if not exists photo_required boolean not null default false,
 add column if not exists failure_action text,
 add column if not exists escalation_role text,
 add column if not exists hold_point boolean not null default false,
 add column if not exists reference text;

-- ---------------- Medical master library metadata ----------------
alter table public.bf_med_master_pm_templates
 add column if not exists manufacturer_id uuid references public.bf_med_manufacturers(id) on delete set null,
 add column if not exists model_family text,
 add column if not exists source_type text not null default 'generic',
 add column if not exists source_name text,
 add column if not exists source_document text,
 add column if not exists source_revision text,
 add column if not exists source_url text,
 add column if not exists verified_at timestamptz,
 add column if not exists verified_by uuid,
 add column if not exists required_skill text,
 add column if not exists required_personnel integer not null default 1,
 add column if not exists required_tools text,
 add column if not exists required_test_equipment text,
 add column if not exists required_ppe text,
 add column if not exists required_consumables text,
 add column if not exists prerequisites text,
 add column if not exists shutdown_required boolean not null default true,
 add column if not exists frequency_basis text not null default 'calendar',
 add column if not exists interval_value numeric,
 add column if not exists interval_unit text,
 add column if not exists meter_type text,
 add column if not exists meter_interval numeric,
 add column if not exists procedure_priority integer not null default 10;

do $$ begin
 if not exists(
   select 1 from pg_constraint
   where conname='bf_med_master_pm_templates_source_type_ck'
 ) then
   alter table public.bf_med_master_pm_templates
   add constraint bf_med_master_pm_templates_source_type_ck
   check(source_type in('generic','oem','vendor','contract','internal','regulatory'));
 end if;
 if not exists(
   select 1 from pg_constraint
   where conname='bf_med_master_pm_templates_frequency_basis_ck'
 ) then
   alter table public.bf_med_master_pm_templates
   add constraint bf_med_master_pm_templates_frequency_basis_ck
   check(frequency_basis in('calendar','runtime','both','condition'));
 end if;
end $$;

alter table public.bf_med_master_pm_steps
 add column if not exists task_type text not null default 'inspection',
 add column if not exists required boolean not null default true,
 add column if not exists unit text,
 add column if not exists min_value numeric,
 add column if not exists max_value numeric,
 add column if not exists acceptance_text text,
 add column if not exists photo_required boolean not null default false,
 add column if not exists tools text,
 add column if not exists materials text,
 add column if not exists failure_action text,
 add column if not exists escalation_role text,
 add column if not exists hold_point boolean not null default false,
 add column if not exists reference text;

-- ---------------- Operational procedure metadata ----------------
alter table public.bf_ppm_procedures
 add column if not exists source_type text not null default 'internal',
 add column if not exists source_name text,
 add column if not exists source_document text,
 add column if not exists source_revision text,
 add column if not exists source_url text,
 add column if not exists master_template_id uuid,
 add column if not exists required_skill text,
 add column if not exists required_personnel integer not null default 1,
 add column if not exists required_tools text,
 add column if not exists required_test_equipment text,
 add column if not exists required_ppe text,
 add column if not exists required_consumables text,
 add column if not exists prerequisites text,
 add column if not exists shutdown_required boolean not null default false,
 add column if not exists loto_required boolean not null default false,
 add column if not exists permit_required boolean not null default false,
 add column if not exists frequency_basis text not null default 'calendar',
 add column if not exists interval_value numeric,
 add column if not exists interval_unit text,
 add column if not exists meter_type text,
 add column if not exists meter_interval numeric;

alter table public.bf_ppm_steps
 add column if not exists acceptance_text text,
 add column if not exists photo_required boolean not null default false,
 add column if not exists failure_action text,
 add column if not exists escalation_role text,
 add column if not exists hold_point boolean not null default false;

-- ---------------- Normalize default frequencies ----------------
update public.bf_master_ppm_templates
set
 interval_value=coalesce(interval_value,
   case frequency
     when 'daily' then 1
     when 'weekly' then 1
     when 'monthly' then 1
     when 'quarterly' then 3
     when 'semiannual' then 6
     when 'annual' then 12
   end),
 interval_unit=coalesce(interval_unit,
   case frequency
     when 'daily' then 'day'
     when 'weekly' then 'week'
     else 'month'
   end),
 required_personnel=greatest(coalesce(required_personnel,1),1),
 source_type=coalesce(source_type,'generic'),
 required_skill=coalesce(required_skill,'Maintenance Technician');

update public.bf_med_master_pm_templates
set
 interval_value=coalesce(interval_value,interval_months),
 interval_unit=coalesce(interval_unit,'month'),
 required_personnel=greatest(coalesce(required_personnel,1),1),
 source_type=coalesce(source_type,'generic'),
 required_skill=coalesce(required_skill,'Biomedical Engineer / Biomedical Technician'),
 required_ppe=coalesce(required_ppe,'As required by hospital infection-control and device-service policy'),
 prerequisites=coalesce(prerequisites,'Remove device from clinical use and follow approved OEM/hospital biomedical procedure before service.');

-- ---------------- Seed missing facility baseline templates ----------------
-- Ensures every active Facilities library item has at least one executable
-- baseline procedure. These remain source_type=generic until a verified OEM,
-- vendor or contract procedure is entered.
insert into public.bf_master_ppm_templates(
 asset_type_id,manufacturer_id,title_ar,title_en,frequency,estimated_minutes,
 reference,status,source_type,source_name,required_skill,required_tools,
 required_test_equipment,required_ppe,required_consumables,prerequisites,
 shutdown_required,loto_required,permit_required,frequency_basis,interval_value,interval_unit
)
select
 t.id,null,
 'فحص وصيانة دورية - '||t.name_ar,
 t.name_en||' Preventive Maintenance',
 case
   when t.default_criticality='critical' then 'monthly'
   when t.default_criticality='high' then 'quarterly'
   else 'semiannual'
 end,
 case
   when t.default_criticality='critical' then 90
   when t.default_criticality='high' then 75
   else 60
 end,
 'Generic baseline - replace or supersede with verified OEM/vendor/contract procedure where available.',
 'active','generic','Basmat Generic Baseline',
 case
   when t.system_code in('ELECTRICAL','MV','LV','UPS','GENERATOR','SOLAR') then 'Qualified Electrical Technician'
   when t.system_code in('HVAC','MECHANICAL','PLUMBING','WATER') then 'Mechanical / HVAC Technician'
   when t.system_code in('FIRE','FIRE_ALARM','FIRE_FIGHTING') then 'Fire & Life Safety Technician'
   when t.system_code in('ICT','TELEPHONY','WIRELESS','RADIO','DAS','STRUCTURED_CABLING','BMS','ELV','CCTV','ACCESS_CONTROL') then 'ELV / ICT Technician'
   else 'Qualified Maintenance Technician'
 end,
 'Standard hand tools suitable for the equipment',
 case
   when t.system_code in('ELECTRICAL','MV','LV','UPS','GENERATOR','SOLAR') then 'Approved multimeter / clamp meter and test equipment as applicable'
   when t.system_code in('HVAC','MECHANICAL','PLUMBING','WATER') then 'Operating measurement instruments as applicable'
   else 'Inspection/test equipment appropriate to the asset'
 end,
 'Site PPE and task-specific PPE',
 'Cleaning materials and approved minor consumables as applicable',
 'Review asset history, isolate hazards, verify access and approved work method.',
 false,
 case when t.system_code in('ELECTRICAL','MV','LV','UPS','GENERATOR','SOLAR','HVAC','MECHANICAL') then true else false end,
 false,
 'calendar',
 case
   when t.default_criticality='critical' then 1
   when t.default_criticality='high' then 3
   else 6
 end,
 'month'
from public.bf_master_asset_types t
where t.status='active'
and not exists(
 select 1 from public.bf_master_ppm_templates p
 where p.asset_type_id=t.id and p.status='active'
);

-- Generic baseline checklist for any facility template with no steps.
insert into public.bf_master_ppm_steps(
 template_id,seq,title_ar,title_en,instructions_ar,instructions_en,task_type,
 response_type,required,acceptance_text,photo_required,safety_notes,tools,materials,
 failure_action,escalation_role,hold_point,reference
)
select p.id,s.seq,s.title_ar,s.title_en,s.instructions_ar,s.instructions_en,s.task_type,
 s.response_type,true,s.acceptance_text,s.photo_required,s.safety_notes,s.tools,s.materials,
 s.failure_action,s.escalation_role,s.hold_point,'Generic baseline'
from public.bf_master_ppm_templates p
cross join lateral (values
 (1,'مراجعة السلامة والتاريخ','Safety and history review',
  'راجع الأعطال السابقة، أمر العمل، التصاريح والمخاطر قبل بدء الصيانة.',
  'Review prior faults, work order, permits and hazards before maintenance.',
  'safety','pass_fail','All required controls available',false,
  'Apply site safety rules, isolation and LOTO where required.','PPE / LOTO kit as applicable',null,
  'Stop work and escalate before continuing.','Supervisor',true),
 (2,'فحص بصري شامل','General visual inspection',
  'افحص الحالة العامة والتثبيت والتسريب والتآكل والاهتزاز والضوضاء والعلامات غير الطبيعية.',
  'Inspect general condition, mounting, leakage, corrosion, vibration, noise and abnormal indications.',
  'inspection','pass_fail','No unsafe condition or unaddressed visible defect',true,
  'Do not touch energized/moving parts unless the approved method allows it.','Inspection tools',null,
  'Record defect; create corrective action if required.','Supervisor',false),
 (3,'التنظيف والحالة الميكانيكية','Cleaning and mechanical condition',
  'نظف الأجزاء المسموح بها وافحص المثبتات والوصلات والأجزاء المتحركة حسب نوع الأصل.',
  'Clean permitted areas and inspect fasteners, connections and moving parts as applicable.',
  'cleaning','pass_fail','Clean and secure with no abnormal wear',false,
  'Use only approved cleaning materials.','Standard hand tools','Approved cleaning consumables',
  'Record defect and required spare/repair.','Supervisor',false),
 (4,'فحص التشغيل والقراءات','Operational check and readings',
  'شغل الأصل بالطريقة المعتمدة وسجل القراءات التشغيلية المتاحة وقارنها بالحدود المعتمدة.',
  'Operate under the approved method, record available operating readings and compare with approved limits.',
  'test','text','Within OEM/site approved operating limits',false,
  'Do not bypass interlocks or safety devices.','Appropriate test instruments',null,
  'If outside approved limits, stop/secure equipment as required and escalate.','Maintenance Manager',true),
 (5,'فحص الحمايات والإنذارات','Protection and alarm check',
  'تحقق من مؤشرات الحماية والإنذارات والإنترلوك بدون تعطيل وسائل الأمان.',
  'Verify protection, alarms and interlocks without defeating safety functions.',
  'test','pass_fail','Safety/protection functions indicate normal status',false,
  'Never defeat safety interlocks for routine PM.','Approved test method',null,
  'Fail PM and raise corrective work if safety function is abnormal.','Maintenance Manager',true),
 (6,'التوثيق والإغلاق','Documentation and closeout',
  'سجل النتائج والصور والقراءات وقطع الغيار المطلوبة وأي ملاحظات قبل الإغلاق.',
  'Record results, photos, readings, required spares and observations before closeout.',
  'inspection','text','All required evidence and follow-up actions recorded',false,
  null,null,null,
  'Do not close the task with unresolved mandatory failures.','Supervisor',true)
) as s(seq,title_ar,title_en,instructions_ar,instructions_en,task_type,response_type,acceptance_text,photo_required,safety_notes,tools,materials,failure_action,escalation_role,hold_point)
where p.status='active'
and not exists(select 1 from public.bf_master_ppm_steps z where z.template_id=p.id)
on conflict(template_id,seq) do nothing;

-- Enrich existing steps with execution controls.
update public.bf_master_ppm_steps
set
 required=coalesce(required,true),
 acceptance_text=coalesce(acceptance_text,
   case response_type
     when 'pass_fail' then 'Pass only when the condition meets the approved procedure/reference.'
     when 'reading' then 'Reading must be within the approved OEM/vendor/site limit.'
     else 'Record clear evidence and observations.'
   end),
 failure_action=coalesce(failure_action,'Record the finding and escalate when the condition is unsafe or outside approved limits.'),
 escalation_role=coalesce(escalation_role,'Supervisor');

update public.bf_med_master_pm_steps
set
 required=coalesce(required,true),
 acceptance_text=coalesce(acceptance_text,
   case response_type
     when 'pass_fail' then 'Pass only when the device meets the approved OEM/biomedical procedure.'
     when 'reading' then 'Reading must be within the approved OEM/calibration tolerance.'
     else 'Record objective evidence and observations.'
   end),
 failure_action=coalesce(failure_action,'Remove from service when safety/performance is not acceptable and escalate to authorized biomedical personnel.'),
 escalation_role=coalesce(escalation_role,'Biomedical Supervisor'),
 tools=coalesce(tools,'Approved biomedical service tools as required'),
 materials=coalesce(materials,'OEM-approved consumables/parts where applicable');

-- ---------------- Runtime execution package ----------------
create table if not exists public.bf_maintenance_execution_packages(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 domain text not null check(domain in('facilities','medical')),
 source_job_type text not null check(source_job_type in('facility_ppm','medical_work_order')),
 source_job_id uuid not null,
 asset_id uuid,
 technician_id uuid references auth.users(id),
 procedure_source_id uuid,
 procedure_name_ar text,
 procedure_name_en text,
 procedure_revision text,
 source_type text not null default 'generic',
 source_name text,
 source_document text,
 source_url text,
 frequency_basis text,
 interval_value numeric,
 interval_unit text,
 meter_type text,
 meter_interval numeric,
 estimated_minutes integer,
 required_skill text,
 required_personnel integer not null default 1,
 required_tools text,
 required_test_equipment text,
 required_ppe text,
 required_consumables text,
 prerequisites text,
 shutdown_required boolean not null default false,
 loto_required boolean not null default false,
 permit_required boolean not null default false,
 procedure_snapshot jsonb not null default '{}'::jsonb,
 status text not null default 'assigned' check(status in('assigned','started','blocked','completed','cancelled')),
 started_at timestamptz,
 completed_at timestamptz,
 completion_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(domain,source_job_id)
);
create index if not exists bf_exec_pkg_tech on public.bf_maintenance_execution_packages(technician_id,status,created_at desc);
create index if not exists bf_exec_pkg_org on public.bf_maintenance_execution_packages(organization_id,status,created_at desc);

create table if not exists public.bf_maintenance_execution_results(
 id uuid primary key default gen_random_uuid(),
 package_id uuid not null references public.bf_maintenance_execution_packages(id) on delete cascade,
 organization_id uuid not null references public.bf_organizations(id),
 step_seq integer not null,
 step_title_ar text,
 step_title_en text,
 response_type text not null,
 result_text text,
 reading_value numeric,
 pass_fail text check(pass_fail is null or pass_fail in('pass','fail','na')),
 photo_url text,
 notes text,
 performed_by uuid not null references auth.users(id),
 performed_at timestamptz not null default now(),
 unique(package_id,step_seq)
);
create index if not exists bf_exec_result_pkg on public.bf_maintenance_execution_results(package_id,step_seq);

alter table public.bf_maintenance_execution_packages enable row level security;
alter table public.bf_maintenance_execution_results enable row level security;

drop policy if exists bf_exec_pkg_read on public.bf_maintenance_execution_packages;
create policy bf_exec_pkg_read on public.bf_maintenance_execution_packages
for select to authenticated
using(
 technician_id=auth.uid()
 or public.bf_can(organization_id,'maintenance.knowledge.manage')
 or public.bf_can(organization_id,'ppm.manage')
 or public.bf_can(organization_id,'medical.manage')
);

drop policy if exists bf_exec_res_read on public.bf_maintenance_execution_results;
create policy bf_exec_res_read on public.bf_maintenance_execution_results
for select to authenticated
using(
 exists(
   select 1 from public.bf_maintenance_execution_packages p
   where p.id=package_id
     and (
       p.technician_id=auth.uid()
       or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
       or public.bf_can(p.organization_id,'ppm.manage')
       or public.bf_can(p.organization_id,'medical.manage')
     )
 )
);

revoke all on public.bf_maintenance_execution_packages from public,anon,authenticated;
revoke all on public.bf_maintenance_execution_results from public,anon,authenticated;
grant select on public.bf_maintenance_execution_packages to authenticated;
grant select on public.bf_maintenance_execution_results to authenticated;

-- ---------------- Facilities adoption: copy full knowledge metadata ----------------
create or replace function public.bf_master_adopt_templates(p_org uuid,p_asset_type uuid,p_manufacturer uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 t public.bf_master_asset_types;
 m public.bf_master_manufacturers;
 cat uuid;
 p record;
 proc uuid;
 n integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not public.bf_can(p_org,'assets.manage') then raise exception 'Permission denied' using errcode='42501'; end if;

 select * into t from public.bf_master_asset_types where id=p_asset_type and status='active';
 if not found then raise exception 'Asset type not found'; end if;

 if p_manufacturer is not null then
   select * into m from public.bf_master_manufacturers where id=p_manufacturer and status='active';
   if not found then raise exception 'Manufacturer not found'; end if;
 end if;

 select id into cat from public.bf_asset_categories where organization_id=p_org and code=t.code;
 if cat is null then
   insert into public.bf_asset_categories(
     organization_id,code,name_ar,name_en,description,icon_text,master_asset_type_id,preferred_manufacturer_id
   )
   values(
     p_org,t.code,t.name_ar,t.name_en,coalesce(t.description_en,t.name_en),t.icon_text,t.id,p_manufacturer
   )
   returning id into cat;
 else
   update public.bf_asset_categories
   set icon_text=t.icon_text,
       master_asset_type_id=t.id,
       preferred_manufacturer_id=coalesce(p_manufacturer,preferred_manufacturer_id)
   where id=cat;
 end if;

 for p in
   with ranked as (
     select x.*,
       row_number() over(
         partition by x.frequency
         order by
           case when x.manufacturer_id=p_manufacturer and p_manufacturer is not null then 3
                when x.manufacturer_id is null then 1 else 0 end desc,
           case x.source_type
             when 'oem' then 60
             when 'vendor' then 50
             when 'contract' then 40
             when 'regulatory' then 35
             when 'internal' then 20
             else 10
           end desc,
           x.procedure_priority desc,
           x.verified_at desc nulls last,
           x.created_at desc
       ) rn
     from public.bf_master_ppm_templates x
     where x.asset_type_id=t.id
       and x.status='active'
       and (x.manufacturer_id is null or x.manufacturer_id=p_manufacturer)
   )
   select * from ranked where rn=1 order by frequency
 loop
   if not exists(
     select 1 from public.bf_ppm_procedures z
     where z.organization_id=p_org
       and z.category_id=cat
       and z.name_en=p.title_en
       and z.status<>'archived'
   ) then
     insert into public.bf_ppm_procedures(
       organization_id,code,name_ar,name_en,category_id,manufacturer,model,frequency,status,
       reference,estimated_minutes,created_by,
       source_type,source_name,source_document,source_revision,source_url,master_template_id,
       required_skill,required_personnel,required_tools,required_test_equipment,required_ppe,
       required_consumables,prerequisites,shutdown_required,loto_required,permit_required,
       frequency_basis,interval_value,interval_unit,meter_type,meter_interval
     )
     values(
       p_org,'LIB-'||left(replace(t.code,'-',''),12)||'-'||left(replace(p.id::text,'-',''),8),
       p.title_ar,p.title_en,cat,
       case when p_manufacturer is null then null else m.name end,
       p.model_family,p.frequency,'approved',
       p.reference,p.estimated_minutes,auth.uid(),
       p.source_type,p.source_name,p.source_document,p.source_revision,p.source_url,p.id,
       p.required_skill,p.required_personnel,p.required_tools,p.required_test_equipment,p.required_ppe,
       p.required_consumables,p.prerequisites,p.shutdown_required,p.loto_required,p.permit_required,
       p.frequency_basis,p.interval_value,p.interval_unit,p.meter_type,p.meter_interval
     )
     returning id into proc;

     insert into public.bf_ppm_steps(
       procedure_id,seq,title_ar,title_en,instructions_ar,instructions_en,task_type,required,
       response_type,unit,min_value,max_value,safety_notes,tools,materials,reference,
       acceptance_text,photo_required,failure_action,escalation_role,hold_point
     )
     select
       proc,s.seq,s.title_ar,s.title_en,s.instructions_ar,s.instructions_en,s.task_type,s.required,
       s.response_type,s.unit,s.min_value,s.max_value,s.safety_notes,s.tools,s.materials,s.reference,
       s.acceptance_text,s.photo_required,s.failure_action,s.escalation_role,s.hold_point
     from public.bf_master_ppm_steps s
     where s.template_id=p.id
     order by s.seq;

     n:=n+1;
   end if;
 end loop;

 return jsonb_build_object(
   'category_id',cat,
   'procedures_created',n,
   'asset_type',t.name_en,
   'manufacturer',m.name,
   'icon',t.icon_text
 );
end $$;

revoke all on function public.bf_master_adopt_templates(uuid,uuid,uuid) from public,anon;
grant execute on function public.bf_master_adopt_templates(uuid,uuid,uuid) to authenticated;

-- ---------------- Resolve best medical procedure ----------------
create or replace function public.bf_med_resolve_template(p_asset uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare a public.bf_med_assets; v uuid;
begin
 select * into a from public.bf_med_assets where id=p_asset;
 if not found then raise exception 'Medical asset not found'; end if;

 select p.id into v
 from public.bf_med_master_pm_templates p
 where p.asset_type_id=a.master_type_id
   and p.status='active'
   and (p.manufacturer_id is null or p.manufacturer_id=a.manufacturer_id)
   and (p.model_family is null or lower(coalesce(a.model,'')) like '%'||lower(p.model_family)||'%')
 order by
   case when p.model_family is not null and lower(coalesce(a.model,'')) like '%'||lower(p.model_family)||'%' then 4 else 0 end desc,
   case when p.manufacturer_id=a.manufacturer_id and a.manufacturer_id is not null then 3 else 1 end desc,
   case p.source_type
     when 'oem' then 60
     when 'vendor' then 50
     when 'contract' then 40
     when 'regulatory' then 35
     when 'internal' then 20
     else 10
   end desc,
   p.procedure_priority desc,
   p.verified_at desc nulls last,
   p.created_at desc
 limit 1;

 return v;
end $$;

-- ---------------- Build execution package: Facilities ----------------
create or replace function public.bf_build_facility_execution_package(p_job uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 j public.bf_ppm_jobs;
 pl public.bf_ppm_plans;
 a public.bf_assets;
 pr public.bf_ppm_procedures;
 v uuid;
 steps jsonb;
begin
 select * into j from public.bf_ppm_jobs where id=p_job;
 if not found then raise exception 'PPM job not found'; end if;

 select * into pl from public.bf_ppm_plans where id=j.plan_id;
 if not found then return null; end if;

 select * into a from public.bf_assets where id=pl.asset_id;
 if not found then return null; end if;

 select * into pr from public.bf_ppm_procedures where id=pl.procedure_id;
 if not found then return null; end if;

 select coalesce(jsonb_agg(
   jsonb_build_object(
     'seq',s.seq,'title_ar',s.title_ar,'title_en',s.title_en,
     'instructions_ar',s.instructions_ar,'instructions_en',s.instructions_en,
     'task_type',s.task_type,'required',s.required,'response_type',s.response_type,
     'unit',s.unit,'min_value',s.min_value,'max_value',s.max_value,
     'acceptance_text',s.acceptance_text,'photo_required',s.photo_required,
     'safety_notes',s.safety_notes,'tools',s.tools,'materials',s.materials,
     'failure_action',s.failure_action,'escalation_role',s.escalation_role,
     'hold_point',s.hold_point,'reference',s.reference
   ) order by s.seq
 ),'[]'::jsonb)
 into steps
 from public.bf_ppm_steps s
 where s.procedure_id=pr.id;

 insert into public.bf_maintenance_execution_packages(
   organization_id,domain,source_job_type,source_job_id,asset_id,technician_id,procedure_source_id,
   procedure_name_ar,procedure_name_en,procedure_revision,source_type,source_name,source_document,
   source_url,frequency_basis,interval_value,interval_unit,meter_type,meter_interval,estimated_minutes,
   required_skill,required_personnel,required_tools,required_test_equipment,required_ppe,
   required_consumables,prerequisites,shutdown_required,loto_required,permit_required,procedure_snapshot
 )
 values(
   j.organization_id,'facilities','facility_ppm',j.id,a.id,j.assigned_to,pr.id,
   pr.name_ar,pr.name_en,coalesce(pr.source_revision,pr.version::text),pr.source_type,pr.source_name,
   pr.source_document,pr.source_url,pr.frequency_basis,pr.interval_value,pr.interval_unit,
   pr.meter_type,pr.meter_interval,pr.estimated_minutes,pr.required_skill,pr.required_personnel,
   pr.required_tools,pr.required_test_equipment,pr.required_ppe,pr.required_consumables,
   pr.prerequisites,pr.shutdown_required,pr.loto_required,pr.permit_required,
   jsonb_build_object(
     'domain','facilities',
     'job',to_jsonb(j),
     'asset',to_jsonb(a),
     'procedure',to_jsonb(pr),
     'steps',steps
   )
 )
 on conflict(domain,source_job_id) do update
 set technician_id=excluded.technician_id,
     procedure_snapshot=excluded.procedure_snapshot,
     updated_at=now()
 returning id into v;

 return v;
end $$;

-- ---------------- Build execution package: Medical ----------------
create or replace function public.bf_build_medical_execution_package(p_work_order uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 w public.bf_med_work_orders;
 a public.bf_med_assets;
 t public.bf_med_master_pm_templates;
 v_template uuid;
 v uuid;
 steps jsonb;
begin
 select * into w from public.bf_med_work_orders where id=p_work_order;
 if not found then raise exception 'Medical work order not found'; end if;
 if w.asset_id is null then return null; end if;

 select * into a from public.bf_med_assets where id=w.asset_id;
 if not found then return null; end if;

 v_template:=public.bf_med_resolve_template(a.id);
 if v_template is null then return null; end if;

 select * into t from public.bf_med_master_pm_templates where id=v_template;

 select coalesce(jsonb_agg(
   jsonb_build_object(
     'seq',s.seq,'title_ar',s.title_ar,'title_en',s.title_en,
     'instructions_ar',s.instructions_ar,'instructions_en',s.instructions_en,
     'task_type',s.task_type,'required',s.required,'response_type',s.response_type,
     'unit',s.unit,'min_value',s.min_value,'max_value',s.max_value,
     'acceptance_text',s.acceptance_text,'photo_required',s.photo_required,
     'safety_notes',s.safety_notes,'tools',s.tools,'materials',s.materials,
     'failure_action',s.failure_action,'escalation_role',s.escalation_role,
     'hold_point',s.hold_point,'reference',s.reference
   ) order by s.seq
 ),'[]'::jsonb)
 into steps
 from public.bf_med_master_pm_steps s
 where s.template_id=t.id;

 insert into public.bf_maintenance_execution_packages(
   organization_id,domain,source_job_type,source_job_id,asset_id,technician_id,procedure_source_id,
   procedure_name_ar,procedure_name_en,procedure_revision,source_type,source_name,source_document,
   source_url,frequency_basis,interval_value,interval_unit,meter_type,meter_interval,estimated_minutes,
   required_skill,required_personnel,required_tools,required_test_equipment,required_ppe,
   required_consumables,prerequisites,shutdown_required,loto_required,permit_required,procedure_snapshot
 )
 values(
   w.organization_id,'medical','medical_work_order',w.id,a.id,w.assigned_to,t.id,
   t.title_ar,t.title_en,t.source_revision,t.source_type,t.source_name,t.source_document,t.source_url,
   t.frequency_basis,t.interval_value,t.interval_unit,t.meter_type,t.meter_interval,t.estimated_minutes,
   t.required_skill,t.required_personnel,t.required_tools,t.required_test_equipment,t.required_ppe,
   t.required_consumables,t.prerequisites,t.shutdown_required,false,false,
   jsonb_build_object(
     'domain','medical',
     'work_order',to_jsonb(w),
     'asset',to_jsonb(a),
     'procedure',to_jsonb(t),
     'steps',steps,
     'safety_notice','Generic templates are baselines only. Follow the verified OEM/vendor procedure and hospital biomedical policy for release to clinical service.'
   )
 )
 on conflict(domain,source_job_id) do update
 set technician_id=excluded.technician_id,
     procedure_snapshot=excluded.procedure_snapshot,
     updated_at=now()
 returning id into v;

 return v;
end $$;

-- Assignment triggers. They intentionally do not block assignment if a legacy
-- record lacks a resolvable procedure.
create or replace function public.bf_exec_pkg_from_ppm_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if new.assigned_to is not null and (tg_op='INSERT' or old.assigned_to is distinct from new.assigned_to) then
   begin
     perform public.bf_build_facility_execution_package(new.id);
   exception when others then
     null;
   end;
 end if;
 return new;
end $$;

drop trigger if exists bf_exec_pkg_ppm_assignment on public.bf_ppm_jobs;
create trigger bf_exec_pkg_ppm_assignment
after insert or update of assigned_to on public.bf_ppm_jobs
for each row execute function public.bf_exec_pkg_from_ppm_assignment();

create or replace function public.bf_exec_pkg_from_med_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if new.assigned_to is not null and (tg_op='INSERT' or old.assigned_to is distinct from new.assigned_to) then
   begin
     perform public.bf_build_medical_execution_package(new.id);
   exception when others then
     null;
   end;
 end if;
 return new;
end $$;

drop trigger if exists bf_exec_pkg_med_assignment on public.bf_med_work_orders;
create trigger bf_exec_pkg_med_assignment
after insert or update of assigned_to on public.bf_med_work_orders
for each row execute function public.bf_exec_pkg_from_med_assignment();

-- ---------------- Technician RPCs ----------------
create or replace function public.bf_my_execution_packages()
returns setof public.bf_maintenance_execution_packages
language sql
stable
security definer
set search_path=''
as $$
 select p.*
 from public.bf_maintenance_execution_packages p
 where p.technician_id=auth.uid()
    or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 order by
   case p.status when 'started' then 1 when 'assigned' then 2 when 'blocked' then 3 else 4 end,
   p.created_at desc
$$;

create or replace function public.bf_start_execution_package(p_package uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare p public.bf_maintenance_execution_packages;
begin
 select * into p from public.bf_maintenance_execution_packages where id=p_package for update;
 if not found then raise exception 'Execution package not found'; end if;
 if not(
   p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 ) then raise exception 'Permission denied' using errcode='42501'; end if;
 if p.status not in('assigned','blocked') then raise exception 'Package cannot be started'; end if;

 update public.bf_maintenance_execution_packages
 set status='started',started_at=coalesce(started_at,now()),updated_at=now()
 where id=p.id;
end $$;

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
declare p public.bf_maintenance_execution_packages; st jsonb; v uuid; rtype text; required_photo boolean;
begin
 select * into p from public.bf_maintenance_execution_packages where id=p_package for update;
 if not found then raise exception 'Execution package not found'; end if;
 if not(
   p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 ) then raise exception 'Permission denied' using errcode='42501'; end if;
 if p.status not in('assigned','started','blocked') then raise exception 'Package is not executable'; end if;

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

 if required_photo and nullif(btrim(coalesce(p_photo_url,'')),'') is null then
   raise exception 'Photo evidence is required';
 end if;

 insert into public.bf_maintenance_execution_results(
   package_id,organization_id,step_seq,step_title_ar,step_title_en,response_type,
   result_text,reading_value,pass_fail,photo_url,notes,performed_by
 )
 values(
   p.id,p.organization_id,p_step_seq,st->>'title_ar',st->>'title_en',rtype,
   nullif(btrim(p_result_text),''),p_reading_value,p_pass_fail,nullif(btrim(p_photo_url),''),
   nullif(btrim(p_notes),''),auth.uid()
 )
 on conflict(package_id,step_seq) do update
 set result_text=excluded.result_text,
     reading_value=excluded.reading_value,
     pass_fail=excluded.pass_fail,
     photo_url=excluded.photo_url,
     notes=excluded.notes,
     performed_by=excluded.performed_by,
     performed_at=now()
 returning id into v;

 update public.bf_maintenance_execution_packages
 set status=case when status='assigned' then 'started' else status end,
     started_at=coalesce(started_at,now()),
     updated_at=now()
 where id=p.id;

 return v;
end $$;

create or replace function public.bf_complete_execution_package(p_package uuid,p_note text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare p public.bf_maintenance_execution_packages; required_count integer; done_count integer; fail_count integer;
begin
 select * into p from public.bf_maintenance_execution_packages where id=p_package for update;
 if not found then raise exception 'Execution package not found'; end if;
 if not(
   p.technician_id=auth.uid()
   or public.bf_can(p.organization_id,'maintenance.knowledge.manage')
 ) then raise exception 'Permission denied' using errcode='42501'; end if;

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
end $$;

revoke all on function public.bf_med_resolve_template(uuid) from public,anon;
grant execute on function public.bf_med_resolve_template(uuid) to authenticated;
revoke all on function public.bf_build_facility_execution_package(uuid) from public,anon;
grant execute on function public.bf_build_facility_execution_package(uuid) to authenticated;
revoke all on function public.bf_build_medical_execution_package(uuid) from public,anon;
grant execute on function public.bf_build_medical_execution_package(uuid) to authenticated;
revoke all on function public.bf_my_execution_packages() from public,anon;
grant execute on function public.bf_my_execution_packages() to authenticated;
revoke all on function public.bf_start_execution_package(uuid) from public,anon;
grant execute on function public.bf_start_execution_package(uuid) to authenticated;
revoke all on function public.bf_submit_execution_step(uuid,integer,text,numeric,text,text,text) from public,anon;
grant execute on function public.bf_submit_execution_step(uuid,integer,text,numeric,text,text,text) to authenticated;
revoke all on function public.bf_complete_execution_package(uuid,text) from public,anon;
grant execute on function public.bf_complete_execution_package(uuid,text) to authenticated;

-- ---------------- Coverage view ----------------
drop view if exists public.bf_maintenance_library_coverage;
create view public.bf_maintenance_library_coverage
with (security_invoker=true)
as
select
 'facilities'::text as domain,
 t.id as asset_type_id,
 t.code,
 t.name_ar,
 t.name_en,
 count(distinct p.id) filter(where p.status='active') as active_templates,
 count(distinct p.id) filter(where p.status='active' and p.source_type in('oem','vendor','contract','regulatory')) as verified_source_templates,
 count(distinct s.id) as procedure_steps,
 case
   when count(distinct p.id) filter(where p.status='active')>0
    and count(distinct s.id)>0 then true else false
 end as execution_ready
from public.bf_master_asset_types t
left join public.bf_master_ppm_templates p on p.asset_type_id=t.id and p.status='active'
left join public.bf_master_ppm_steps s on s.template_id=p.id
where t.status='active'
group by t.id,t.code,t.name_ar,t.name_en

union all

select
 'medical'::text as domain,
 t.id as asset_type_id,
 t.code,
 t.name_ar,
 t.name_en,
 count(distinct p.id) filter(where p.status='active') as active_templates,
 count(distinct p.id) filter(where p.status='active' and p.source_type in('oem','vendor','contract','regulatory')) as verified_source_templates,
 count(distinct s.id) as procedure_steps,
 case
   when count(distinct p.id) filter(where p.status='active')>0
    and count(distinct s.id)>0 then true else false
 end as execution_ready
from public.bf_med_master_types t
left join public.bf_med_master_pm_templates p on p.asset_type_id=t.id and p.status='active'
left join public.bf_med_master_pm_steps s on s.template_id=p.id
where t.status='active'
group by t.id,t.code,t.name_ar,t.name_en;

grant select on public.bf_maintenance_library_coverage to authenticated;

-- ---------------- Knowledge-quality view ----------------
drop view if exists public.bf_maintenance_source_quality;
create view public.bf_maintenance_source_quality
with (security_invoker=true)
as
select
 domain,
 count(*) as asset_types,
 count(*) filter(where execution_ready) as execution_ready,
 count(*) filter(where verified_source_templates>0) as with_verified_oem_vendor_source,
 count(*) filter(where verified_source_templates=0 and execution_ready) as generic_baseline_only
from public.bf_maintenance_library_coverage
group by domain;
grant select on public.bf_maintenance_source_quality to authenticated;

notify pgrst,'reload schema';
commit;
