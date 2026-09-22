begin;

insert into public.bf_permissions(code,description) values
 ('medical.view','View medical equipment maintenance'),
 ('medical.manage','Manage medical equipment register and maintenance'),
 ('medical.library.manage','Manage medical equipment master library'),
 ('medical.calibration','Record medical device calibration / verification'),
 ('medical.workorders','Manage medical equipment work orders')
on conflict(code) do nothing;

insert into public.bf_role_permissions(role_id,permission_id)
select r.id,p.id
from public.bf_roles r cross join public.bf_permissions p
where r.code='company_admin' and p.code like 'medical.%'
on conflict do nothing;

create table if not exists public.bf_med_manufacturers(
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name text not null unique,
 status text not null default 'active' check(status in('active','inactive')),
 created_at timestamptz not null default now()
);

create table if not exists public.bf_med_master_types(
 id uuid primary key default gen_random_uuid(),
 system_code text not null,
 code text not null unique,
 name_ar text not null,
 name_en text not null,
 icon_text text not null default '🏥',
 default_criticality text not null default 'high' check(default_criticality in('low','medium','high','critical')),
 default_pm_months integer check(default_pm_months is null or default_pm_months between 1 and 60),
 default_calibration_months integer check(default_calibration_months is null or default_calibration_months between 1 and 60),
 procurement_class text not null default 'standard' check(procurement_class in('standard','long_lead','special_order')),
 default_lead_time_days integer check(default_lead_time_days is null or default_lead_time_days>0),
 description_ar text,
 description_en text,
 status text not null default 'active' check(status in('active','inactive')),
 created_at timestamptz not null default now()
);

create table if not exists public.bf_med_master_options(
 id uuid primary key default gen_random_uuid(),
 asset_type_id uuid not null references public.bf_med_master_types(id) on delete cascade,
 manufacturer_id uuid not null references public.bf_med_manufacturers(id) on delete cascade,
 model_family text,
 status text not null default 'active' check(status in('active','inactive')),
 created_at timestamptz not null default now()
);
create unique index if not exists bf_med_master_option_uq
on public.bf_med_master_options(asset_type_id,manufacturer_id,coalesce(model_family,''));

create table if not exists public.bf_med_master_pm_templates(
 id uuid primary key default gen_random_uuid(),
 asset_type_id uuid not null references public.bf_med_master_types(id) on delete cascade,
 title_ar text not null,
 title_en text not null,
 interval_months integer not null check(interval_months between 1 and 60),
 calibration_required boolean not null default false,
 reference text,
 status text not null default 'active' check(status in('active','inactive')),
 created_at timestamptz not null default now()
);

create table if not exists public.bf_med_master_pm_steps(
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null references public.bf_med_master_pm_templates(id) on delete cascade,
 seq integer not null check(seq>0),
 title_ar text not null,
 title_en text not null,
 instructions_ar text not null default '',
 instructions_en text not null default '',
 response_type text not null default 'pass_fail' check(response_type in('pass_fail','reading','text')),
 safety_notes text,
 unique(template_id,seq)
);

create table if not exists public.bf_med_assets(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 master_type_id uuid not null references public.bf_med_master_types(id),
 manufacturer_id uuid references public.bf_med_manufacturers(id),
 asset_tag text not null,
 model text,
 serial_number text,
 department text not null default '',
 site_name text,
 location_text text,
 sfda_registration_number text,
 risk_class text,
 criticality text not null default 'high' check(criticality in('low','medium','high','critical')),
 operational_status text not null default 'in_service' check(operational_status in('in_service','under_maintenance','out_of_service','retired')),
 installation_date date,
 warranty_end_date date,
 service_provider text,
 service_contract_number text,
 pm_interval_months integer check(pm_interval_months is null or pm_interval_months between 1 and 60),
 calibration_interval_months integer check(calibration_interval_months is null or calibration_interval_months between 1 and 60),
 next_pm_date date,
 next_calibration_date date,
 notes text,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,asset_tag)
);
create index if not exists bf_med_assets_org on public.bf_med_assets(organization_id,operational_status);
create index if not exists bf_med_assets_due on public.bf_med_assets(organization_id,next_pm_date,next_calibration_date);

create table if not exists public.bf_med_pm_history(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 asset_id uuid not null references public.bf_med_assets(id) on delete cascade,
 activity_type text not null check(activity_type in('preventive','calibration','verification','corrective_inspection')),
 performed_at timestamptz not null default now(),
 result text not null default 'pass' check(result in('pass','pass_with_observation','fail')),
 certificate_number text,
 service_provider text,
 notes text,
 performed_by uuid references auth.users(id),
 next_due_date date,
 created_at timestamptz not null default now()
);
create index if not exists bf_med_pm_history_asset on public.bf_med_pm_history(asset_id,performed_at desc);

create table if not exists public.bf_med_work_orders(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.bf_organizations(id),
 asset_id uuid references public.bf_med_assets(id),
 work_order_number text not null,
 work_type text not null check(work_type in('corrective','preventive','calibration','inspection')),
 title text not null,
 description text not null default '',
 priority text not null default 'normal' check(priority in('low','normal','high','critical')),
 status text not null default 'open' check(status in('open','assigned','in_progress','waiting_parts','completed','closed','cancelled')),
 assigned_to uuid references auth.users(id),
 opened_by uuid references auth.users(id),
 opened_at timestamptz not null default now(),
 due_date date,
 completed_at timestamptz,
 service_provider text,
 parts_required text,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,work_order_number)
);
create index if not exists bf_med_wo_org on public.bf_med_work_orders(organization_id,status,priority);

create sequence if not exists public.bf_med_wo_seq;
revoke all on sequence public.bf_med_wo_seq from public,anon,authenticated;

create or replace function public.bf_med_assign_wo_number()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.work_order_number is null or btrim(new.work_order_number)='' then
  new.work_order_number='MED-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.bf_med_wo_seq')::text,6,'0');
 end if;
 return new;
end $$;
drop trigger if exists bf_med_wo_number on public.bf_med_work_orders;
create trigger bf_med_wo_number before insert on public.bf_med_work_orders
for each row execute function public.bf_med_assign_wo_number();

alter table public.bf_med_manufacturers enable row level security;
alter table public.bf_med_master_types enable row level security;
alter table public.bf_med_master_options enable row level security;
alter table public.bf_med_master_pm_templates enable row level security;
alter table public.bf_med_master_pm_steps enable row level security;
alter table public.bf_med_assets enable row level security;
alter table public.bf_med_pm_history enable row level security;
alter table public.bf_med_work_orders enable row level security;

drop policy if exists bf_med_master_read_mfr on public.bf_med_manufacturers;
create policy bf_med_master_read_mfr on public.bf_med_manufacturers for select to authenticated using(status='active' or public.bf_is_super_admin());
drop policy if exists bf_med_master_read_type on public.bf_med_master_types;
create policy bf_med_master_read_type on public.bf_med_master_types for select to authenticated using(status='active' or public.bf_is_super_admin());
drop policy if exists bf_med_master_read_opt on public.bf_med_master_options;
create policy bf_med_master_read_opt on public.bf_med_master_options for select to authenticated using(status='active' or public.bf_is_super_admin());
drop policy if exists bf_med_master_read_tpl on public.bf_med_master_pm_templates;
create policy bf_med_master_read_tpl on public.bf_med_master_pm_templates for select to authenticated using(status='active' or public.bf_is_super_admin());
drop policy if exists bf_med_master_read_step on public.bf_med_master_pm_steps;
create policy bf_med_master_read_step on public.bf_med_master_pm_steps for select to authenticated using(true);

drop policy if exists bf_med_assets_r on public.bf_med_assets;
create policy bf_med_assets_r on public.bf_med_assets for select to authenticated using(public.bf_can(organization_id,'medical.view'));
drop policy if exists bf_med_assets_w on public.bf_med_assets;
create policy bf_med_assets_w on public.bf_med_assets for all to authenticated
using(public.bf_can(organization_id,'medical.manage'))
with check(public.bf_can(organization_id,'medical.manage'));

drop policy if exists bf_med_hist_r on public.bf_med_pm_history;
create policy bf_med_hist_r on public.bf_med_pm_history for select to authenticated using(public.bf_can(organization_id,'medical.view'));
drop policy if exists bf_med_hist_w on public.bf_med_pm_history;
create policy bf_med_hist_w on public.bf_med_pm_history for all to authenticated
using(public.bf_can(organization_id,'medical.calibration') or public.bf_can(organization_id,'medical.manage'))
with check(public.bf_can(organization_id,'medical.calibration') or public.bf_can(organization_id,'medical.manage'));

drop policy if exists bf_med_wo_r on public.bf_med_work_orders;
create policy bf_med_wo_r on public.bf_med_work_orders for select to authenticated using(public.bf_can(organization_id,'medical.view'));
drop policy if exists bf_med_wo_w on public.bf_med_work_orders;
create policy bf_med_wo_w on public.bf_med_work_orders for all to authenticated
using(public.bf_can(organization_id,'medical.workorders') or public.bf_can(organization_id,'medical.manage'))
with check(public.bf_can(organization_id,'medical.workorders') or public.bf_can(organization_id,'medical.manage'));

insert into public.bf_med_manufacturers(code,name)
values
('GEHC','GE HealthCare'),
('SIEMENS-H','Siemens Healthineers'),
('PHILIPS-H','Philips Healthcare'),
('CANON-MED','Canon Medical Systems'),
('FUJIFILM-MED','Fujifilm Healthcare'),
('DRAGER','Dräger'),
('MINDRAY','Mindray'),
('NIHON-KOHDEN','Nihon Kohden'),
('MASIMO','Masimo'),
('SCHILLER','Schiller'),
('ZOLL','ZOLL Medical'),
('BAXTER','Baxter'),
('BRAUN','B. Braun'),
('FRESENIUS','Fresenius Medical Care'),
('GETINGE','Getinge'),
('STERIS','STERIS'),
('STRYKER','Stryker'),
('HILLROM','Hillrom / Baxter'),
('MEDTRONIC','Medtronic'),
('OLYMPUS','Olympus'),
('KARL-STORZ','KARL STORZ'),
('PENTAX-MED','PENTAX Medical'),
('ROCHE-DIAG','Roche Diagnostics'),
('ABBOTT-DIAG','Abbott Diagnostics'),
('BECKMAN','Beckman Coulter'),
('SYSMEX','Sysmex'),
('BIORAD','Bio-Rad'),
('THERMO','Thermo Fisher Scientific'),
('BD','BD'),
('HOLOGIC','Hologic'),
('ZEISS-MED','ZEISS Medical Technology'),
('NIDEK','NIDEK'),
('ALCON','Alcon'),
('PLANMECA','Planmeca'),
('DENTSPLY','Dentsply Sirona'),
('KAVO','KaVo Dental'),
('CARESTREAM','Carestream'),
('TUTTNAUER','Tuttnauer'),
('MAQUET','Maquet / Getinge'),
('HAMILTON','Hamilton Medical'),
('VYAIRE','Vyaire Medical'),
('RESMED','ResMed'),
('DRAEGER-NEO','Dräger Neonatal Care')
on conflict(code) do update set name=excluded.name,status='active';

insert into public.bf_med_master_types(
 system_code,code,name_ar,name_en,default_criticality,icon_text,
 default_pm_months,default_calibration_months,procurement_class,default_lead_time_days
)
values
('PATIENT_MONITORING','MED-PATIENT-MONITOR','جهاز مراقبة المريض','Patient Monitor','critical','🫀',12,12,'standard',45),
('PATIENT_MONITORING','MED-CENTRAL-MONITOR','نظام مراقبة مركزي','Central Monitoring Station','critical','🖥️',12,12,'long_lead',90),
('PATIENT_MONITORING','MED-ECG','جهاز تخطيط قلب ECG','ECG Machine','high','❤️',12,12,'standard',45),
('PATIENT_MONITORING','MED-HOLTER','جهاز هولتر','Holter Monitor','high','❤️',12,12,'standard',45),
('PATIENT_MONITORING','MED-VITAL-SIGNS','جهاز علامات حيوية','Vital Signs Monitor','high','🩺',12,12,'standard',45),
('PATIENT_MONITORING','MED-PULSE-OX','جهاز قياس الأكسجين','Pulse Oximeter','high','🫁',12,12,'standard',30),
('PATIENT_MONITORING','MED-NIBP','جهاز ضغط إلكتروني','Electronic Blood Pressure Monitor','medium','🩺',12,12,'standard',30),
('CRITICAL_CARE','MED-VENTILATOR','جهاز تنفس صناعي','Ventilator','critical','🫁',6,6,'long_lead',120),
('CRITICAL_CARE','MED-DEFIBRILLATOR','جهاز صدمات كهربائية','Defibrillator','critical','⚡',6,6,'standard',60),
('CRITICAL_CARE','MED-INFUSION-PUMP','مضخة محاليل','Infusion Pump','critical','💉',12,12,'standard',45),
('CRITICAL_CARE','MED-SYRINGE-PUMP','مضخة حقن','Syringe Pump','critical','💉',12,12,'standard',45),
('CRITICAL_CARE','MED-SUCTION','جهاز شفط طبي','Medical Suction Unit','high','🫁',12,12,'standard',30),
('CRITICAL_CARE','MED-HIGH-FLOW','جهاز أوكسجين عالي التدفق','High Flow Oxygen Therapy Unit','critical','🫁',6,6,'standard',60),
('CRITICAL_CARE','MED-ECMO','جهاز ECMO','ECMO System','critical','🫀',3,6,'long_lead',180),
('ANESTHESIA_OR','MED-ANESTHESIA','جهاز تخدير','Anesthesia Machine','critical','😷',6,6,'long_lead',120),
('ANESTHESIA_OR','MED-OR-TABLE','طاولة عمليات','Operating Table','critical','🛏️',12,12,'long_lead',120),
('ANESTHESIA_OR','MED-SURGICAL-LIGHT','إضاءة عمليات','Surgical Light','high','💡',12,12,'long_lead',90),
('ANESTHESIA_OR','MED-ELECTROSURGICAL','جهاز كي جراحي','Electrosurgical Unit','critical','⚡',12,12,'standard',60),
('ANESTHESIA_OR','MED-C-ARM','جهاز C-Arm','C-Arm Imaging System','critical','☢️',6,12,'long_lead',150),
('ANESTHESIA_OR','MED-TOURNIQUET','جهاز تورنيكيه','Surgical Tourniquet','high','🩸',12,12,'standard',45),
('ANESTHESIA_OR','MED-PATIENT-WARMER','جهاز تدفئة المريض','Patient Warming System','high','🌡️',12,12,'standard',45),
('IMAGING','MED-XRAY','جهاز أشعة سينية','X-Ray System','critical','☢️',6,12,'long_lead',180),
('IMAGING','MED-MOBILE-XRAY','جهاز أشعة متنقل','Mobile X-Ray','critical','☢️',6,12,'long_lead',150),
('IMAGING','MED-CT','جهاز أشعة مقطعية CT','CT Scanner','critical','🌀',3,6,'long_lead',240),
('IMAGING','MED-MRI','جهاز رنين مغناطيسي MRI','MRI System','critical','🧲',3,6,'long_lead',300),
('IMAGING','MED-ULTRASOUND','جهاز موجات فوق صوتية','Ultrasound System','high','📡',6,12,'long_lead',120),
('IMAGING','MED-MAMMOGRAPHY','جهاز ماموغرام','Mammography System','critical','☢️',6,12,'long_lead',180),
('IMAGING','MED-BONE-DENSITY','جهاز قياس كثافة العظام','Bone Densitometer','high','🦴',12,12,'long_lead',150),
('IMAGING','MED-PACS-WS','محطة PACS تشخيصية','Diagnostic PACS Workstation','high','🖥️',12,12,'long_lead',90),
('LAB','MED-CHEM-ANALYZER','محلل كيمياء حيوية','Clinical Chemistry Analyzer','critical','🧪',6,6,'long_lead',120),
('LAB','MED-HEMATOLOGY','محلل دم','Hematology Analyzer','critical','🩸',6,6,'long_lead',120),
('LAB','MED-IMMUNOASSAY','محلل مناعة','Immunoassay Analyzer','critical','🧪',6,6,'long_lead',120),
('LAB','MED-BLOOD-GAS','محلل غازات الدم','Blood Gas Analyzer','critical','🩸',6,6,'standard',60),
('LAB','MED-ELECTROLYTE','محلل إلكتروليت','Electrolyte Analyzer','high','🧪',6,6,'standard',60),
('LAB','MED-COAGULATION','محلل تخثر','Coagulation Analyzer','high','🩸',6,6,'standard',60),
('LAB','MED-MICROSCOPE','مجهر مختبر','Laboratory Microscope','medium','🔬',12,12,'standard',45),
('LAB','MED-CENTRIFUGE','جهاز طرد مركزي','Laboratory Centrifuge','high','🧪',12,12,'standard',45),
('LAB','MED-LAB-INCUBATOR','حاضنة مختبر','Laboratory Incubator','high','🌡️',12,12,'standard',45),
('LAB','MED-BIOSAFETY','كابينة أمان حيوي','Biosafety Cabinet','critical','🧫',6,12,'long_lead',90),
('LAB','MED-PCR','جهاز PCR','PCR System','critical','🧬',6,6,'long_lead',120),
('LAB','MED-LAB-REFRIGERATOR','ثلاجة مختبر','Laboratory Refrigerator','critical','🧊',6,12,'standard',60),
('LAB','MED-BLOOD-BANK-FRIDGE','ثلاجة بنك دم','Blood Bank Refrigerator','critical','🩸',3,6,'long_lead',90),
('LAB','MED-BLOOD-BANK-FREEZER','فريزر بنك دم','Blood Bank Freezer','critical','🧊',3,6,'long_lead',90),
('STERILIZATION','MED-AUTOCLAVE','أوتوكلاف','Steam Sterilizer / Autoclave','critical','♨️',6,6,'long_lead',150),
('STERILIZATION','MED-WASHER-DISINFECTOR','غسالة ومطهر أدوات','Washer Disinfector','critical','🧼',6,6,'long_lead',120),
('STERILIZATION','MED-LOW-TEMP-STER','جهاز تعقيم منخفض الحرارة','Low Temperature Sterilizer','critical','♨️',6,6,'long_lead',150),
('STERILIZATION','MED-SEALER','جهاز تغليف وتعقيم','Sterile Packaging Sealer','high','📦',12,12,'standard',45),
('STERILIZATION','MED-ULTRASONIC-CLEANER','منظف بالموجات فوق الصوتية','Ultrasonic Cleaner','high','🫧',12,12,'standard',45),
('DIALYSIS','MED-HEMODIALYSIS','جهاز غسيل كلوي','Hemodialysis Machine','critical','🩸',6,6,'long_lead',120),
('DIALYSIS','MED-RO-DIALYSIS','وحدة RO لغسيل الكلى','Dialysis RO Unit','critical','💧',3,6,'long_lead',150),
('NEONATAL_MATERNITY','MED-INFANT-INCUBATOR','حاضنة أطفال','Infant Incubator','critical','👶',6,6,'long_lead',90),
('NEONATAL_MATERNITY','MED-INFANT-WARMER','جهاز تدفئة أطفال','Infant Radiant Warmer','critical','👶',6,6,'long_lead',90),
('NEONATAL_MATERNITY','MED-PHOTOTHERAPY','جهاز علاج ضوئي','Phototherapy Unit','high','💡',12,12,'standard',45),
('NEONATAL_MATERNITY','MED-FETAL-MONITOR','جهاز مراقبة الجنين','Fetal Monitor / CTG','critical','👶',6,12,'standard',60),
('NEONATAL_MATERNITY','MED-DELIVERY-BED','سرير ولادة','Delivery Bed','high','🛏️',12,12,'standard',60),
('ENDOSCOPY','MED-ENDOSCOPY-TOWER','برج مناظير','Endoscopy Tower','critical','🎥',6,12,'long_lead',120),
('ENDOSCOPY','MED-ENDOSCOPE','منظار مرن','Flexible Endoscope','critical','🔬',6,12,'long_lead',90),
('ENDOSCOPY','MED-ENDOSCOPE-WASHER','غسالة مناظير','Endoscope Reprocessor','critical','🧼',6,6,'long_lead',120),
('EMERGENCY','MED-AED','جهاز AED','Automated External Defibrillator','critical','⚡',6,12,'standard',45),
('EMERGENCY','MED-EMERGENCY-STRETCHER','نقالة طوارئ','Emergency Stretcher','high','🛏️',12,12,'standard',45),
('DENTAL','MED-DENTAL-UNIT','كرسي ووحدة أسنان','Dental Unit / Chair','high','🦷',12,12,'long_lead',90),
('DENTAL','MED-DENTAL-XRAY','جهاز أشعة أسنان','Dental X-Ray','high','☢️',6,12,'long_lead',90),
('DENTAL','MED-DENTAL-CBCT','جهاز CBCT أسنان','Dental CBCT','critical','☢️',6,12,'long_lead',150),
('DENTAL','MED-DENTAL-AUTOCLAVE','أوتوكلاف أسنان','Dental Autoclave','critical','♨️',6,6,'standard',60),
('OPHTHALMOLOGY','MED-SLIT-LAMP','مصباح شقي','Slit Lamp','high','👁️',12,12,'standard',45),
('OPHTHALMOLOGY','MED-AUTOREFRACTOR','جهاز فحص انكسار','Auto Refractometer','high','👁️',12,12,'standard',45),
('OPHTHALMOLOGY','MED-OCT','جهاز OCT','Optical Coherence Tomography','critical','👁️',6,12,'long_lead',120),
('OPHTHALMOLOGY','MED-PHACO','جهاز فاكو','Phacoemulsification System','critical','👁️',6,6,'long_lead',150),
('PHARMACY','MED-PHARM-FRIDGE','ثلاجة أدوية','Pharmacy Refrigerator','critical','💊',6,12,'standard',60),
('PHARMACY','MED-AUTOMATED-DISPENSING','جهاز صرف أدوية آلي','Automated Medication Dispensing Cabinet','critical','💊',6,12,'long_lead',120),
('REHAB','MED-PHYSIO-ULTRASOUND','جهاز علاج طبيعي بالموجات','Therapeutic Ultrasound','medium','🦿',12,12,'standard',45),
('REHAB','MED-TENS','جهاز TENS','TENS Unit','medium','⚡',12,12,'standard',30),
('REHAB','MED-TREADMILL','جهاز مشي طبي','Medical Treadmill','medium','🏃',12,12,'standard',60),
('GENERAL_MEDICAL','MED-HOSPITAL-BED','سرير مستشفى كهربائي','Electric Hospital Bed','high','🛏️',12,12,'standard',60),
('GENERAL_MEDICAL','MED-PATIENT-LIFT','رافعة مريض','Patient Lift','high','♿',12,12,'standard',60),
('GENERAL_MEDICAL','MED-SCALE','ميزان طبي','Medical Scale','medium','⚖️',12,12,'standard',30),
('GENERAL_MEDICAL','MED-NEBULIZER','جهاز نيبولايزر','Nebulizer','medium','🫁',12,12,'standard',30)
on conflict(code) do update set
 system_code=excluded.system_code,name_ar=excluded.name_ar,name_en=excluded.name_en,
 default_criticality=excluded.default_criticality,icon_text=excluded.icon_text,
 default_pm_months=excluded.default_pm_months,default_calibration_months=excluded.default_calibration_months,
 procurement_class=excluded.procurement_class,default_lead_time_days=excluded.default_lead_time_days,status='active';

with x(asset_code,manufacturer_code) as (values
('MED-PATIENT-MONITOR','PHILIPS-H'),
('MED-PATIENT-MONITOR','GEHC'),
('MED-PATIENT-MONITOR','MINDRAY'),
('MED-PATIENT-MONITOR','NIHON-KOHDEN'),
('MED-PATIENT-MONITOR','MASIMO'),
('MED-PATIENT-MONITOR','SCHILLER'),
('MED-CENTRAL-MONITOR','PHILIPS-H'),
('MED-CENTRAL-MONITOR','GEHC'),
('MED-CENTRAL-MONITOR','MINDRAY'),
('MED-CENTRAL-MONITOR','NIHON-KOHDEN'),
('MED-CENTRAL-MONITOR','MASIMO'),
('MED-CENTRAL-MONITOR','SCHILLER'),
('MED-ECG','PHILIPS-H'),
('MED-ECG','GEHC'),
('MED-ECG','MINDRAY'),
('MED-ECG','NIHON-KOHDEN'),
('MED-ECG','MASIMO'),
('MED-ECG','SCHILLER'),
('MED-HOLTER','PHILIPS-H'),
('MED-HOLTER','GEHC'),
('MED-HOLTER','MINDRAY'),
('MED-HOLTER','NIHON-KOHDEN'),
('MED-HOLTER','MASIMO'),
('MED-HOLTER','SCHILLER'),
('MED-VITAL-SIGNS','PHILIPS-H'),
('MED-VITAL-SIGNS','GEHC'),
('MED-VITAL-SIGNS','MINDRAY'),
('MED-VITAL-SIGNS','NIHON-KOHDEN'),
('MED-VITAL-SIGNS','MASIMO'),
('MED-VITAL-SIGNS','SCHILLER'),
('MED-PULSE-OX','PHILIPS-H'),
('MED-PULSE-OX','GEHC'),
('MED-PULSE-OX','MINDRAY'),
('MED-PULSE-OX','NIHON-KOHDEN'),
('MED-PULSE-OX','MASIMO'),
('MED-PULSE-OX','SCHILLER'),
('MED-NIBP','PHILIPS-H'),
('MED-NIBP','GEHC'),
('MED-NIBP','MINDRAY'),
('MED-NIBP','NIHON-KOHDEN'),
('MED-NIBP','MASIMO'),
('MED-NIBP','SCHILLER'),
('MED-VENTILATOR','DRAGER'),
('MED-VENTILATOR','HAMILTON'),
('MED-VENTILATOR','PHILIPS-H'),
('MED-VENTILATOR','GEHC'),
('MED-VENTILATOR','MINDRAY'),
('MED-VENTILATOR','BAXTER'),
('MED-VENTILATOR','BRAUN'),
('MED-VENTILATOR','MEDTRONIC'),
('MED-DEFIBRILLATOR','DRAGER'),
('MED-DEFIBRILLATOR','HAMILTON'),
('MED-DEFIBRILLATOR','PHILIPS-H'),
('MED-DEFIBRILLATOR','GEHC'),
('MED-DEFIBRILLATOR','MINDRAY'),
('MED-DEFIBRILLATOR','BAXTER'),
('MED-DEFIBRILLATOR','BRAUN'),
('MED-DEFIBRILLATOR','MEDTRONIC'),
('MED-INFUSION-PUMP','DRAGER'),
('MED-INFUSION-PUMP','HAMILTON'),
('MED-INFUSION-PUMP','PHILIPS-H'),
('MED-INFUSION-PUMP','GEHC'),
('MED-INFUSION-PUMP','MINDRAY'),
('MED-INFUSION-PUMP','BAXTER'),
('MED-INFUSION-PUMP','BRAUN'),
('MED-INFUSION-PUMP','MEDTRONIC'),
('MED-SYRINGE-PUMP','DRAGER'),
('MED-SYRINGE-PUMP','HAMILTON'),
('MED-SYRINGE-PUMP','PHILIPS-H'),
('MED-SYRINGE-PUMP','GEHC'),
('MED-SYRINGE-PUMP','MINDRAY'),
('MED-SYRINGE-PUMP','BAXTER'),
('MED-SYRINGE-PUMP','BRAUN'),
('MED-SYRINGE-PUMP','MEDTRONIC'),
('MED-SUCTION','DRAGER'),
('MED-SUCTION','HAMILTON'),
('MED-SUCTION','PHILIPS-H'),
('MED-SUCTION','GEHC'),
('MED-SUCTION','MINDRAY'),
('MED-SUCTION','BAXTER'),
('MED-SUCTION','BRAUN'),
('MED-SUCTION','MEDTRONIC'),
('MED-HIGH-FLOW','DRAGER'),
('MED-HIGH-FLOW','HAMILTON'),
('MED-HIGH-FLOW','PHILIPS-H'),
('MED-HIGH-FLOW','GEHC'),
('MED-HIGH-FLOW','MINDRAY'),
('MED-HIGH-FLOW','BAXTER'),
('MED-HIGH-FLOW','BRAUN'),
('MED-HIGH-FLOW','MEDTRONIC'),
('MED-ECMO','DRAGER'),
('MED-ECMO','HAMILTON'),
('MED-ECMO','PHILIPS-H'),
('MED-ECMO','GEHC'),
('MED-ECMO','MINDRAY'),
('MED-ECMO','BAXTER'),
('MED-ECMO','BRAUN'),
('MED-ECMO','MEDTRONIC'),
('MED-ANESTHESIA','DRAGER'),
('MED-ANESTHESIA','GEHC'),
('MED-ANESTHESIA','GETINGE'),
('MED-ANESTHESIA','MAQUET'),
('MED-ANESTHESIA','STRYKER'),
('MED-ANESTHESIA','MEDTRONIC'),
('MED-OR-TABLE','DRAGER'),
('MED-OR-TABLE','GEHC'),
('MED-OR-TABLE','GETINGE'),
('MED-OR-TABLE','MAQUET'),
('MED-OR-TABLE','STRYKER'),
('MED-OR-TABLE','MEDTRONIC'),
('MED-SURGICAL-LIGHT','DRAGER'),
('MED-SURGICAL-LIGHT','GEHC'),
('MED-SURGICAL-LIGHT','GETINGE'),
('MED-SURGICAL-LIGHT','MAQUET'),
('MED-SURGICAL-LIGHT','STRYKER'),
('MED-SURGICAL-LIGHT','MEDTRONIC'),
('MED-ELECTROSURGICAL','DRAGER'),
('MED-ELECTROSURGICAL','GEHC'),
('MED-ELECTROSURGICAL','GETINGE'),
('MED-ELECTROSURGICAL','MAQUET'),
('MED-ELECTROSURGICAL','STRYKER'),
('MED-ELECTROSURGICAL','MEDTRONIC'),
('MED-C-ARM','DRAGER'),
('MED-C-ARM','GEHC'),
('MED-C-ARM','GETINGE'),
('MED-C-ARM','MAQUET'),
('MED-C-ARM','STRYKER'),
('MED-C-ARM','MEDTRONIC'),
('MED-TOURNIQUET','DRAGER'),
('MED-TOURNIQUET','GEHC'),
('MED-TOURNIQUET','GETINGE'),
('MED-TOURNIQUET','MAQUET'),
('MED-TOURNIQUET','STRYKER'),
('MED-TOURNIQUET','MEDTRONIC'),
('MED-PATIENT-WARMER','DRAGER'),
('MED-PATIENT-WARMER','GEHC'),
('MED-PATIENT-WARMER','GETINGE'),
('MED-PATIENT-WARMER','MAQUET'),
('MED-PATIENT-WARMER','STRYKER'),
('MED-PATIENT-WARMER','MEDTRONIC'),
('MED-XRAY','SIEMENS-H'),
('MED-XRAY','GEHC'),
('MED-XRAY','PHILIPS-H'),
('MED-XRAY','CANON-MED'),
('MED-XRAY','FUJIFILM-MED'),
('MED-XRAY','HOLOGIC'),
('MED-MOBILE-XRAY','SIEMENS-H'),
('MED-MOBILE-XRAY','GEHC'),
('MED-MOBILE-XRAY','PHILIPS-H'),
('MED-MOBILE-XRAY','CANON-MED'),
('MED-MOBILE-XRAY','FUJIFILM-MED'),
('MED-MOBILE-XRAY','HOLOGIC'),
('MED-CT','SIEMENS-H'),
('MED-CT','GEHC'),
('MED-CT','PHILIPS-H'),
('MED-CT','CANON-MED'),
('MED-CT','FUJIFILM-MED'),
('MED-CT','HOLOGIC'),
('MED-MRI','SIEMENS-H'),
('MED-MRI','GEHC'),
('MED-MRI','PHILIPS-H'),
('MED-MRI','CANON-MED'),
('MED-MRI','FUJIFILM-MED'),
('MED-MRI','HOLOGIC'),
('MED-ULTRASOUND','SIEMENS-H'),
('MED-ULTRASOUND','GEHC'),
('MED-ULTRASOUND','PHILIPS-H'),
('MED-ULTRASOUND','CANON-MED'),
('MED-ULTRASOUND','FUJIFILM-MED'),
('MED-ULTRASOUND','HOLOGIC'),
('MED-MAMMOGRAPHY','SIEMENS-H'),
('MED-MAMMOGRAPHY','GEHC'),
('MED-MAMMOGRAPHY','PHILIPS-H'),
('MED-MAMMOGRAPHY','CANON-MED'),
('MED-MAMMOGRAPHY','FUJIFILM-MED'),
('MED-MAMMOGRAPHY','HOLOGIC'),
('MED-BONE-DENSITY','SIEMENS-H'),
('MED-BONE-DENSITY','GEHC'),
('MED-BONE-DENSITY','PHILIPS-H'),
('MED-BONE-DENSITY','CANON-MED'),
('MED-BONE-DENSITY','FUJIFILM-MED'),
('MED-BONE-DENSITY','HOLOGIC'),
('MED-PACS-WS','SIEMENS-H'),
('MED-PACS-WS','GEHC'),
('MED-PACS-WS','PHILIPS-H'),
('MED-PACS-WS','CANON-MED'),
('MED-PACS-WS','FUJIFILM-MED'),
('MED-PACS-WS','HOLOGIC'),
('MED-CHEM-ANALYZER','ROCHE-DIAG'),
('MED-CHEM-ANALYZER','ABBOTT-DIAG'),
('MED-CHEM-ANALYZER','BECKMAN'),
('MED-CHEM-ANALYZER','SYSMEX'),
('MED-CHEM-ANALYZER','BIORAD'),
('MED-CHEM-ANALYZER','THERMO'),
('MED-CHEM-ANALYZER','BD'),
('MED-HEMATOLOGY','ROCHE-DIAG'),
('MED-HEMATOLOGY','ABBOTT-DIAG'),
('MED-HEMATOLOGY','BECKMAN'),
('MED-HEMATOLOGY','SYSMEX'),
('MED-HEMATOLOGY','BIORAD'),
('MED-HEMATOLOGY','THERMO'),
('MED-HEMATOLOGY','BD'),
('MED-IMMUNOASSAY','ROCHE-DIAG'),
('MED-IMMUNOASSAY','ABBOTT-DIAG'),
('MED-IMMUNOASSAY','BECKMAN'),
('MED-IMMUNOASSAY','SYSMEX'),
('MED-IMMUNOASSAY','BIORAD'),
('MED-IMMUNOASSAY','THERMO'),
('MED-IMMUNOASSAY','BD'),
('MED-BLOOD-GAS','ROCHE-DIAG'),
('MED-BLOOD-GAS','ABBOTT-DIAG'),
('MED-BLOOD-GAS','BECKMAN'),
('MED-BLOOD-GAS','SYSMEX'),
('MED-BLOOD-GAS','BIORAD'),
('MED-BLOOD-GAS','THERMO'),
('MED-BLOOD-GAS','BD'),
('MED-ELECTROLYTE','ROCHE-DIAG'),
('MED-ELECTROLYTE','ABBOTT-DIAG'),
('MED-ELECTROLYTE','BECKMAN'),
('MED-ELECTROLYTE','SYSMEX'),
('MED-ELECTROLYTE','BIORAD'),
('MED-ELECTROLYTE','THERMO'),
('MED-ELECTROLYTE','BD'),
('MED-COAGULATION','ROCHE-DIAG'),
('MED-COAGULATION','ABBOTT-DIAG'),
('MED-COAGULATION','BECKMAN'),
('MED-COAGULATION','SYSMEX'),
('MED-COAGULATION','BIORAD'),
('MED-COAGULATION','THERMO'),
('MED-COAGULATION','BD'),
('MED-MICROSCOPE','ROCHE-DIAG'),
('MED-MICROSCOPE','ABBOTT-DIAG'),
('MED-MICROSCOPE','BECKMAN'),
('MED-MICROSCOPE','SYSMEX'),
('MED-MICROSCOPE','BIORAD'),
('MED-MICROSCOPE','THERMO'),
('MED-MICROSCOPE','BD'),
('MED-CENTRIFUGE','ROCHE-DIAG'),
('MED-CENTRIFUGE','ABBOTT-DIAG'),
('MED-CENTRIFUGE','BECKMAN'),
('MED-CENTRIFUGE','SYSMEX'),
('MED-CENTRIFUGE','BIORAD'),
('MED-CENTRIFUGE','THERMO'),
('MED-CENTRIFUGE','BD'),
('MED-LAB-INCUBATOR','ROCHE-DIAG'),
('MED-LAB-INCUBATOR','ABBOTT-DIAG'),
('MED-LAB-INCUBATOR','BECKMAN'),
('MED-LAB-INCUBATOR','SYSMEX'),
('MED-LAB-INCUBATOR','BIORAD'),
('MED-LAB-INCUBATOR','THERMO'),
('MED-LAB-INCUBATOR','BD'),
('MED-BIOSAFETY','ROCHE-DIAG'),
('MED-BIOSAFETY','ABBOTT-DIAG'),
('MED-BIOSAFETY','BECKMAN'),
('MED-BIOSAFETY','SYSMEX'),
('MED-BIOSAFETY','BIORAD'),
('MED-BIOSAFETY','THERMO'),
('MED-BIOSAFETY','BD'),
('MED-PCR','ROCHE-DIAG'),
('MED-PCR','ABBOTT-DIAG'),
('MED-PCR','BECKMAN'),
('MED-PCR','SYSMEX'),
('MED-PCR','BIORAD'),
('MED-PCR','THERMO'),
('MED-PCR','BD'),
('MED-LAB-REFRIGERATOR','ROCHE-DIAG'),
('MED-LAB-REFRIGERATOR','ABBOTT-DIAG'),
('MED-LAB-REFRIGERATOR','BECKMAN'),
('MED-LAB-REFRIGERATOR','SYSMEX'),
('MED-LAB-REFRIGERATOR','BIORAD'),
('MED-LAB-REFRIGERATOR','THERMO'),
('MED-LAB-REFRIGERATOR','BD'),
('MED-BLOOD-BANK-FRIDGE','ROCHE-DIAG'),
('MED-BLOOD-BANK-FRIDGE','ABBOTT-DIAG'),
('MED-BLOOD-BANK-FRIDGE','BECKMAN'),
('MED-BLOOD-BANK-FRIDGE','SYSMEX'),
('MED-BLOOD-BANK-FRIDGE','BIORAD'),
('MED-BLOOD-BANK-FRIDGE','THERMO'),
('MED-BLOOD-BANK-FRIDGE','BD'),
('MED-BLOOD-BANK-FREEZER','ROCHE-DIAG'),
('MED-BLOOD-BANK-FREEZER','ABBOTT-DIAG'),
('MED-BLOOD-BANK-FREEZER','BECKMAN'),
('MED-BLOOD-BANK-FREEZER','SYSMEX'),
('MED-BLOOD-BANK-FREEZER','BIORAD'),
('MED-BLOOD-BANK-FREEZER','THERMO'),
('MED-BLOOD-BANK-FREEZER','BD'),
('MED-AUTOCLAVE','GETINGE'),
('MED-AUTOCLAVE','STERIS'),
('MED-AUTOCLAVE','TUTTNAUER'),
('MED-WASHER-DISINFECTOR','GETINGE'),
('MED-WASHER-DISINFECTOR','STERIS'),
('MED-WASHER-DISINFECTOR','TUTTNAUER'),
('MED-LOW-TEMP-STER','GETINGE'),
('MED-LOW-TEMP-STER','STERIS'),
('MED-LOW-TEMP-STER','TUTTNAUER'),
('MED-SEALER','GETINGE'),
('MED-SEALER','STERIS'),
('MED-SEALER','TUTTNAUER'),
('MED-ULTRASONIC-CLEANER','GETINGE'),
('MED-ULTRASONIC-CLEANER','STERIS'),
('MED-ULTRASONIC-CLEANER','TUTTNAUER'),
('MED-HEMODIALYSIS','FRESENIUS'),
('MED-HEMODIALYSIS','BRAUN'),
('MED-HEMODIALYSIS','BAXTER'),
('MED-RO-DIALYSIS','FRESENIUS'),
('MED-RO-DIALYSIS','BRAUN'),
('MED-RO-DIALYSIS','BAXTER'),
('MED-INFANT-INCUBATOR','DRAGER'),
('MED-INFANT-INCUBATOR','DRAEGER-NEO'),
('MED-INFANT-INCUBATOR','GEHC'),
('MED-INFANT-INCUBATOR','PHILIPS-H'),
('MED-INFANT-INCUBATOR','MINDRAY'),
('MED-INFANT-WARMER','DRAGER'),
('MED-INFANT-WARMER','DRAEGER-NEO'),
('MED-INFANT-WARMER','GEHC'),
('MED-INFANT-WARMER','PHILIPS-H'),
('MED-INFANT-WARMER','MINDRAY'),
('MED-PHOTOTHERAPY','DRAGER'),
('MED-PHOTOTHERAPY','DRAEGER-NEO'),
('MED-PHOTOTHERAPY','GEHC'),
('MED-PHOTOTHERAPY','PHILIPS-H'),
('MED-PHOTOTHERAPY','MINDRAY'),
('MED-FETAL-MONITOR','DRAGER'),
('MED-FETAL-MONITOR','DRAEGER-NEO'),
('MED-FETAL-MONITOR','GEHC'),
('MED-FETAL-MONITOR','PHILIPS-H'),
('MED-FETAL-MONITOR','MINDRAY'),
('MED-DELIVERY-BED','DRAGER'),
('MED-DELIVERY-BED','DRAEGER-NEO'),
('MED-DELIVERY-BED','GEHC'),
('MED-DELIVERY-BED','PHILIPS-H'),
('MED-DELIVERY-BED','MINDRAY'),
('MED-ENDOSCOPY-TOWER','OLYMPUS'),
('MED-ENDOSCOPY-TOWER','KARL-STORZ'),
('MED-ENDOSCOPY-TOWER','PENTAX-MED'),
('MED-ENDOSCOPY-TOWER','FUJIFILM-MED'),
('MED-ENDOSCOPE','OLYMPUS'),
('MED-ENDOSCOPE','KARL-STORZ'),
('MED-ENDOSCOPE','PENTAX-MED'),
('MED-ENDOSCOPE','FUJIFILM-MED'),
('MED-ENDOSCOPE-WASHER','OLYMPUS'),
('MED-ENDOSCOPE-WASHER','KARL-STORZ'),
('MED-ENDOSCOPE-WASHER','PENTAX-MED'),
('MED-ENDOSCOPE-WASHER','FUJIFILM-MED'),
('MED-AED','ZOLL'),
('MED-AED','PHILIPS-H'),
('MED-AED','STRYKER'),
('MED-AED','SCHILLER'),
('MED-EMERGENCY-STRETCHER','ZOLL'),
('MED-EMERGENCY-STRETCHER','PHILIPS-H'),
('MED-EMERGENCY-STRETCHER','STRYKER'),
('MED-EMERGENCY-STRETCHER','SCHILLER'),
('MED-DENTAL-UNIT','PLANMECA'),
('MED-DENTAL-UNIT','DENTSPLY'),
('MED-DENTAL-UNIT','KAVO'),
('MED-DENTAL-UNIT','CARESTREAM'),
('MED-DENTAL-XRAY','PLANMECA'),
('MED-DENTAL-XRAY','DENTSPLY'),
('MED-DENTAL-XRAY','KAVO'),
('MED-DENTAL-XRAY','CARESTREAM'),
('MED-DENTAL-CBCT','PLANMECA'),
('MED-DENTAL-CBCT','DENTSPLY'),
('MED-DENTAL-CBCT','KAVO'),
('MED-DENTAL-CBCT','CARESTREAM'),
('MED-DENTAL-AUTOCLAVE','PLANMECA'),
('MED-DENTAL-AUTOCLAVE','DENTSPLY'),
('MED-DENTAL-AUTOCLAVE','KAVO'),
('MED-DENTAL-AUTOCLAVE','CARESTREAM'),
('MED-SLIT-LAMP','ZEISS-MED'),
('MED-SLIT-LAMP','NIDEK'),
('MED-SLIT-LAMP','ALCON'),
('MED-AUTOREFRACTOR','ZEISS-MED'),
('MED-AUTOREFRACTOR','NIDEK'),
('MED-AUTOREFRACTOR','ALCON'),
('MED-OCT','ZEISS-MED'),
('MED-OCT','NIDEK'),
('MED-OCT','ALCON'),
('MED-PHACO','ZEISS-MED'),
('MED-PHACO','NIDEK'),
('MED-PHACO','ALCON'),
('MED-PHARM-FRIDGE','BAXTER'),
('MED-PHARM-FRIDGE','BD'),
('MED-AUTOMATED-DISPENSING','BAXTER'),
('MED-AUTOMATED-DISPENSING','BD'),
('MED-PHYSIO-ULTRASOUND','PHILIPS-H'),
('MED-PHYSIO-ULTRASOUND','STRYKER'),
('MED-TENS','PHILIPS-H'),
('MED-TENS','STRYKER'),
('MED-TREADMILL','PHILIPS-H'),
('MED-TREADMILL','STRYKER'),
('MED-HOSPITAL-BED','STRYKER'),
('MED-HOSPITAL-BED','HILLROM'),
('MED-HOSPITAL-BED','BAXTER'),
('MED-HOSPITAL-BED','GEHC'),
('MED-HOSPITAL-BED','PHILIPS-H'),
('MED-PATIENT-LIFT','STRYKER'),
('MED-PATIENT-LIFT','HILLROM'),
('MED-PATIENT-LIFT','BAXTER'),
('MED-PATIENT-LIFT','GEHC'),
('MED-PATIENT-LIFT','PHILIPS-H'),
('MED-SCALE','STRYKER'),
('MED-SCALE','HILLROM'),
('MED-SCALE','BAXTER'),
('MED-SCALE','GEHC'),
('MED-SCALE','PHILIPS-H'),
('MED-NEBULIZER','STRYKER'),
('MED-NEBULIZER','HILLROM'),
('MED-NEBULIZER','BAXTER'),
('MED-NEBULIZER','GEHC'),
('MED-NEBULIZER','PHILIPS-H')
)
insert into public.bf_med_master_options(asset_type_id,manufacturer_id)
select t.id,m.id
from x
join public.bf_med_master_types t on t.code=x.asset_code
join public.bf_med_manufacturers m on m.code=x.manufacturer_code
where not exists(
 select 1 from public.bf_med_master_options o
 where o.asset_type_id=t.id and o.manufacturer_id=m.id and o.model_family is null
);

insert into public.bf_med_master_pm_templates(asset_type_id,title_ar,title_en,interval_months,calibration_required,reference)
select t.id,
 'الصيانة الوقائية - '||t.name_ar,
 'Preventive Maintenance - '||t.name_en,
 coalesce(t.default_pm_months,12),
 true,
 'Baseline only. Follow OEM service manual, hospital biomedical policy and approved quality/safety procedures.'
from public.bf_med_master_types t
where t.status='active'
and not exists(select 1 from public.bf_med_master_pm_templates p where p.asset_type_id=t.id and p.status='active');

insert into public.bf_med_master_pm_steps(template_id,seq,title_ar,title_en,instructions_ar,instructions_en,response_type,safety_notes)
select p.id,s.seq,s.ar,s.en,s.iar,s.ien,s.resp,s.safety
from public.bf_med_master_pm_templates p
cross join lateral (values
 (1,'فحص الحالة والتعريف','Identification and physical inspection',
  'تحقق من هوية الجهاز والملصقات والحالة الخارجية والكابلات والملحقات دون فتح الجهاز إلا وفق إجراء معتمد.',
  'Verify device identity, labels, physical condition, cables and accessories. Do not open the device unless covered by an approved service procedure.',
  'pass_fail','Qualified biomedical personnel only. Follow OEM and hospital safety procedures.'),
 (2,'فحص الطاقة والسلامة','Power and safety check',
  'تحقق من مصدر الطاقة والبطارية والإنذارات ومؤشرات السلامة وفق تعليمات المصنع.',
  'Check power supply, battery, alarms and safety indicators according to the OEM instructions.',
  'pass_fail','Use approved electrical safety test equipment where required by local policy.'),
 (3,'اختبار وظيفي','Functional verification',
  'نفذ اختباراً وظيفياً معتمداً بدون استخدام على مريض وسجل النتيجة.',
  'Perform an approved functional verification without patient use and record the result.',
  'text','No clinical use during maintenance testing.'),
 (4,'التحقق من المعايرة','Calibration / measurement verification',
  'تحقق من حالة المعايرة وشهادة القياس وحدد الحاجة لمعايرة بواسطة جهة أو فني مؤهل.',
  'Verify calibration status and measurement certificate; identify whether qualified calibration is due.',
  'text','Do not perform calibration outside trained scope or OEM procedure.'),
 (5,'التحديثات والنسخ الاحتياطي','Software/configuration review',
  'تحقق من الإصدارات والإعدادات المعتمدة والنسخ الاحتياطي عند انطباق ذلك.',
  'Verify approved software/firmware versions, configuration and backup where applicable.',
  'text','Only approved software and change-control procedures.'),
 (6,'توثيق الأعطال وقطع الغيار','Defects and spare-parts record',
  'سجل العيوب وقطع الغيار المطلوبة وLong Lead Items وأي توصية بإيقاف الجهاز عن الخدمة.',
  'Record defects, required spares, long-lead items and any recommendation to remove the device from service.',
  'text','Unsafe devices must remain out of service until released by authorized biomedical personnel.')
) s(seq,ar,en,iar,ien,resp,safety)
where not exists(select 1 from public.bf_med_master_pm_steps z where z.template_id=p.id)
on conflict(template_id,seq) do nothing;

create or replace function public.bf_med_register_asset(
 p_org uuid,p_master_type uuid,p_manufacturer uuid default null,p_asset_tag text default null,
 p_model text default null,p_serial text default null,p_department text default '',
 p_site_name text default null,p_location_text text default null,p_sfda_registration text default null,
 p_risk_class text default null,p_installation_date date default null,p_warranty_end date default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare t public.bf_med_master_types; v_id uuid;
begin
 if auth.uid() is null or not public.bf_can(p_org,'medical.manage') then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 if nullif(btrim(p_asset_tag),'') is null then raise exception 'Asset tag required'; end if;
 select * into t from public.bf_med_master_types where id=p_master_type and status='active';
 if not found then raise exception 'Medical asset type not found'; end if;

 insert into public.bf_med_assets(
  organization_id,master_type_id,manufacturer_id,asset_tag,model,serial_number,department,
  site_name,location_text,sfda_registration_number,risk_class,criticality,installation_date,warranty_end_date,
  pm_interval_months,calibration_interval_months,
  next_pm_date,next_calibration_date,created_by
 )
 values(
  p_org,p_master_type,p_manufacturer,btrim(p_asset_tag),nullif(btrim(p_model),''),
  nullif(btrim(p_serial),''),coalesce(p_department,''),nullif(btrim(p_site_name),''),
  nullif(btrim(p_location_text),''),nullif(btrim(p_sfda_registration),''),
  nullif(btrim(p_risk_class),''),t.default_criticality,p_installation_date,p_warranty_end,
  t.default_pm_months,t.default_calibration_months,
  case when t.default_pm_months is null then null else current_date + make_interval(months=>t.default_pm_months) end,
  case when t.default_calibration_months is null then null else current_date + make_interval(months=>t.default_calibration_months) end,
  auth.uid()
 )
 returning id into v_id;
 return v_id;
end $$;

create or replace function public.bf_med_complete_activity(
 p_asset uuid,p_activity_type text,p_result text,p_notes text default null,
 p_certificate text default null,p_service_provider text default null,p_next_due date default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare a public.bf_med_assets; v_id uuid; nd date;
begin
 select * into a from public.bf_med_assets where id=p_asset;
 if not found then raise exception 'Medical asset not found'; end if;
 if auth.uid() is null or not (public.bf_can(a.organization_id,'medical.calibration') or public.bf_can(a.organization_id,'medical.manage')) then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 if p_activity_type not in('preventive','calibration','verification','corrective_inspection') then raise exception 'Invalid activity type'; end if;
 if p_result not in('pass','pass_with_observation','fail') then raise exception 'Invalid result'; end if;

 nd:=p_next_due;
 if nd is null then
  if p_activity_type='calibration' and a.calibration_interval_months is not null then
   nd:=current_date+make_interval(months=>a.calibration_interval_months);
  elsif p_activity_type='preventive' and a.pm_interval_months is not null then
   nd:=current_date+make_interval(months=>a.pm_interval_months);
  end if;
 end if;

 insert into public.bf_med_pm_history(
  organization_id,asset_id,activity_type,result,certificate_number,service_provider,notes,performed_by,next_due_date
 ) values(
  a.organization_id,a.id,p_activity_type,p_result,nullif(btrim(p_certificate),''),
  nullif(btrim(p_service_provider),''),nullif(btrim(p_notes),''),auth.uid(),nd
 ) returning id into v_id;

 update public.bf_med_assets
 set next_pm_date=case when p_activity_type='preventive' then nd else next_pm_date end,
     next_calibration_date=case when p_activity_type='calibration' then nd else next_calibration_date end,
     operational_status=case when p_result='fail' then 'out_of_service' else operational_status end,
     updated_at=now()
 where id=a.id;

 return v_id;
end $$;

create or replace function public.bf_med_create_work_order(
 p_asset uuid,p_work_type text,p_title text,p_description text default '',
 p_priority text default 'normal',p_due_date date default null
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare a public.bf_med_assets; v_id uuid;
begin
 select * into a from public.bf_med_assets where id=p_asset;
 if not found then raise exception 'Medical asset not found'; end if;
 if auth.uid() is null or not (public.bf_can(a.organization_id,'medical.workorders') or public.bf_can(a.organization_id,'medical.manage')) then
  raise exception 'Permission denied' using errcode='42501';
 end if;
 insert into public.bf_med_work_orders(
  organization_id,asset_id,work_order_number,work_type,title,description,priority,opened_by,due_date
 ) values(
  a.organization_id,a.id,'',p_work_type,btrim(p_title),coalesce(p_description,''),p_priority,auth.uid(),p_due_date
 ) returning id into v_id;
 return v_id;
end $$;

create or replace function public.bf_med_admin_type_upsert(
 p_id uuid default null,p_system_code text default null,p_code text default null,
 p_name_ar text default null,p_name_en text default null,p_icon text default '🏥',
 p_criticality text default 'high',p_pm_months integer default 12,p_cal_months integer default 12,
 p_procurement text default 'standard',p_lead_days integer default 45
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v uuid;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if p_id is null then
  insert into public.bf_med_master_types(system_code,code,name_ar,name_en,icon_text,default_criticality,default_pm_months,default_calibration_months,procurement_class,default_lead_time_days)
  values(upper(btrim(p_system_code)),upper(btrim(p_code)),btrim(p_name_ar),btrim(p_name_en),coalesce(nullif(btrim(p_icon),''),'🏥'),p_criticality,p_pm_months,p_cal_months,p_procurement,p_lead_days)
  returning id into v;
 else
  update public.bf_med_master_types set
   system_code=upper(btrim(p_system_code)),code=upper(btrim(p_code)),name_ar=btrim(p_name_ar),name_en=btrim(p_name_en),
   icon_text=coalesce(nullif(btrim(p_icon),''),'🏥'),default_criticality=p_criticality,default_pm_months=p_pm_months,
   default_calibration_months=p_cal_months,procurement_class=p_procurement,default_lead_time_days=p_lead_days,status='active'
  where id=p_id returning id into v;
 end if;
 return v;
end $$;

create or replace function public.bf_med_admin_manufacturer_upsert(
 p_id uuid default null,p_code text default null,p_name text default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v uuid;
begin
 if auth.uid() is null or not public.bf_is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if p_id is null then
  select id into v from public.bf_med_manufacturers where lower(name)=lower(btrim(p_name)) limit 1;
  if v is null then
   insert into public.bf_med_manufacturers(code,name) values(upper(btrim(p_code)),btrim(p_name)) returning id into v;
  end if;
 else
  update public.bf_med_manufacturers set code=upper(btrim(p_code)),name=btrim(p_name),status='active' where id=p_id returning id into v;
 end if;
 return v;
end $$;

revoke all on function public.bf_med_register_asset(uuid,uuid,uuid,text,text,text,text,text,text,text,text,date,date) from public,anon;
grant execute on function public.bf_med_register_asset(uuid,uuid,uuid,text,text,text,text,text,text,text,text,date,date) to authenticated;
revoke all on function public.bf_med_complete_activity(uuid,text,text,text,text,text,date) from public,anon;
grant execute on function public.bf_med_complete_activity(uuid,text,text,text,text,text,date) to authenticated;
revoke all on function public.bf_med_create_work_order(uuid,text,text,text,text,date) from public,anon;
grant execute on function public.bf_med_create_work_order(uuid,text,text,text,text,date) to authenticated;
revoke all on function public.bf_med_admin_type_upsert(uuid,text,text,text,text,text,text,integer,integer,text,integer) from public,anon;
grant execute on function public.bf_med_admin_type_upsert(uuid,text,text,text,text,text,text,integer,integer,text,integer) to authenticated;
revoke all on function public.bf_med_admin_manufacturer_upsert(uuid,text,text) from public,anon;
grant execute on function public.bf_med_admin_manufacturer_upsert(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
