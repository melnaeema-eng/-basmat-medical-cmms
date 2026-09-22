begin;

create table if not exists public.bf_master_asset_types(
 id uuid primary key default gen_random_uuid(),
 system_code text not null,
 code text not null unique,
 name_ar text not null,
 name_en text not null,
 description_ar text,
 description_en text,
 default_criticality text not null default 'medium' check(default_criticality in('low','medium','high','critical')),
 expected_life_years integer,
 status text not null default 'active' check(status in('active','inactive')),
 created_at timestamptz not null default now()
);
create table if not exists public.bf_master_manufacturers(
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name text not null unique,
 website text,
 status text not null default 'active' check(status in('active','inactive')),
 created_at timestamptz not null default now()
);
create table if not exists public.bf_master_asset_options(
 id uuid primary key default gen_random_uuid(),
 asset_type_id uuid not null references public.bf_master_asset_types(id) on delete cascade,
 manufacturer_id uuid references public.bf_master_manufacturers(id) on delete set null,
 model_family text,
 notes text,
 status text not null default 'active' check(status in('active','inactive')),
 unique(asset_type_id,manufacturer_id,model_family)
);
create table if not exists public.bf_master_ppm_templates(
 id uuid primary key default gen_random_uuid(),
 asset_type_id uuid not null references public.bf_master_asset_types(id) on delete cascade,
 manufacturer_id uuid references public.bf_master_manufacturers(id) on delete set null,
 title_ar text not null,title_en text not null,
 frequency text not null check(frequency in('daily','weekly','monthly','quarterly','semiannual','annual')),
 estimated_minutes integer not null default 60 check(estimated_minutes>0),
 reference text,
 status text not null default 'active' check(status in('active','inactive')),
 created_at timestamptz not null default now()
);
create table if not exists public.bf_master_ppm_steps(
 id uuid primary key default gen_random_uuid(),
 template_id uuid not null references public.bf_master_ppm_templates(id) on delete cascade,
 seq integer not null,
 title_ar text not null,title_en text not null,
 instructions_ar text not null default '',instructions_en text not null default '',
 task_type text not null default 'inspection' check(task_type in('inspection','cleaning','lubrication','adjustment','test','replacement','safety','other')),
 response_type text not null default 'pass_fail' check(response_type in('pass_fail','reading','text')),
 unit text,safety_notes text,tools text,materials text,
 unique(template_id,seq)
);

alter table public.bf_master_asset_types enable row level security;
alter table public.bf_master_manufacturers enable row level security;
alter table public.bf_master_asset_options enable row level security;
alter table public.bf_master_ppm_templates enable row level security;
alter table public.bf_master_ppm_steps enable row level security;

do $$ declare t text; begin
 foreach t in array array['bf_master_asset_types','bf_master_manufacturers','bf_master_asset_options','bf_master_ppm_templates','bf_master_ppm_steps'] loop
  execute format('drop policy if exists bf_master_read on public.%I',t);
  execute format('create policy bf_master_read on public.%I for select to authenticated using(true)',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;

insert into public.bf_master_asset_types(system_code,code,name_ar,name_en,default_criticality,expected_life_years) values
('HVAC','HVAC-SPLIT','مكيف سبليت','Split AC','medium',12),
('HVAC','HVAC-PACKAGE','مكيف باكيج','Package AC Unit','high',15),
('HVAC','HVAC-ROOFTOP','وحدة روف توب','Rooftop Unit','high',15),
('HVAC','HVAC-AHU','وحدة مناولة هواء AHU','Air Handling Unit','high',18),
('HVAC','HVAC-FCU','وحدة ملف ومروحة FCU','Fan Coil Unit','medium',15),
('HVAC','HVAC-VRF','نظام VRF','VRF System','high',15),
('HVAC','HVAC-CHILLER-AIR','شيلر تبريد هوائي','Air-Cooled Chiller','critical',20),
('HVAC','HVAC-CHILLER-WATER','شيلر تبريد مائي','Water-Cooled Chiller','critical',25),
('HVAC','HVAC-COOLING-TOWER','برج تبريد','Cooling Tower','critical',20),
('HVAC','HVAC-PUMP-CHW','مضخة مياه مبردة','Chilled Water Pump','high',15),
('BMS','BMS-SERVER','خادم BMS','BMS Server','critical',8),
('BMS','BMS-CONTROLLER','كنترولر BMS','BMS Controller','high',12),
('BMS','BMS-SENSOR','حساس BMS','BMS Sensor','medium',10),
('FIRE','FIRE-ALARM-PANEL','لوحة إنذار حريق','Fire Alarm Control Panel','critical',15),
('FIRE','FIRE-SMOKE','كاشف دخان','Smoke Detector','high',10),
('FIRE','FIRE-HEAT','كاشف حرارة','Heat Detector','high',10),
('FIRE','FIRE-BEAM','كاشف شعاعي','Beam Detector','high',10),
('FIRE','FIRE-MCP','نقطة نداء يدوية','Manual Call Point','high',15),
('FIRE','FIRE-FM200','نظام إطفاء FM-200','FM-200 Suppression System','critical',20),
('FIRE','FIRE-NOVEC','نظام إطفاء Novec 1230 قائم','Existing Novec 1230 Suppression System','critical',20),
('FIRE','FIRE-PUMP','مضخة حريق','Fire Pump','critical',20),
('FIRE','FIRE-SPRINKLER','شبكة رش آلي','Fire Sprinkler System','critical',25),
('ELECTRICAL','ELEC-TRANSFORMER','محول كهربائي','Transformer','critical',30),
('ELECTRICAL','ELEC-MDB','لوحة توزيع رئيسية MDB','Main Distribution Board','critical',25),
('ELECTRICAL','ELEC-SMDB','لوحة توزيع فرعية SMDB','Sub Main Distribution Board','high',25),
('ELECTRICAL','ELEC-DB','لوحة توزيع DB','Distribution Board','high',20),
('ELECTRICAL','ELEC-GENERATOR','مولد ديزل','Diesel Generator','critical',20),
('ELECTRICAL','ELEC-ATS','مفتاح تحويل آلي ATS','Automatic Transfer Switch','critical',20),
('ELECTRICAL','ELEC-UPS','UPS','UPS','critical',12),
('ELECTRICAL','ELEC-BATTERY','بنك بطاريات','Battery Bank','high',6),
('ELECTRICAL','ELEC-CAPBANK','بنك مكثفات','Capacitor Bank','high',15),
('PLUMBING','PLUMB-BOOSTER','مضخة تقوية','Booster Pump','high',15),
('PLUMBING','PLUMB-SUMP','مضخة تجميع','Sump Pump','high',10),
('PLUMBING','PLUMB-SEWAGE','مضخة صرف','Sewage Pump','high',12),
('PLUMBING','PLUMB-TANK','خزان مياه','Water Tank','high',25),
('SECURITY','SEC-CCTV','كاميرا مراقبة','CCTV Camera','medium',7),
('SECURITY','SEC-NVR','مسجل شبكي NVR','Network Video Recorder','high',7),
('SECURITY','SEC-ACS','لوحة تحكم دخول','Access Control Panel','high',10),
('ICT','ICT-SWITCH','سويتش شبكة','Network Switch','high',8),
('ICT','ICT-RACK','راك اتصالات','ICT Rack','medium',20),
('DATACENTER','DC-CRAC','تكييف دقيق CRAC','CRAC Precision Cooling','critical',15),
('DATACENTER','DC-PDU','PDU','Power Distribution Unit','critical',15),
('VERTICAL','LIFT','مصعد','Elevator','critical',25),
('VERTICAL','ESCALATOR','سلم متحرك','Escalator','critical',25),
('GENERAL','AUTO-DOOR','باب أوتوماتيكي','Automatic Door','medium',12),
('GENERAL','BARRIER','بوابة مركبات','Vehicle Barrier','medium',12),
('GENERAL','RO-SYSTEM','نظام تناضح عكسي RO','Reverse Osmosis System','high',15),
('GENERAL','STP','محطة معالجة صرف','Sewage Treatment Plant','critical',25)
on conflict(code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,default_criticality=excluded.default_criticality,expected_life_years=excluded.expected_life_years;

insert into public.bf_master_manufacturers(code,name) values
('ZAMIL','Zamil Air Conditioners'),('CARRIER','Carrier'),('TRANE','Trane'),('YORK','YORK / Johnson Controls'),('DAIKIN','Daikin'),('MITSUBISHI','Mitsubishi Electric'),('LG','LG'),('SAMSUNG','Samsung'),
('JCI','Johnson Controls'),('HONEYWELL','Honeywell'),('SIEMENS','Siemens'),('SCHNEIDER','Schneider Electric'),('ABB','ABB'),('EATON','Eaton'),('LEGRAND','Legrand'),
('NOTIFIER','NOTIFIER by Honeywell'),('SIMPLEX','Simplex / Johnson Controls'),('BOSCH','Bosch'),('KIDDE','Kidde'),('ANSUL','ANSUL'),
('CUMMINS','Cummins'),('CATERPILLAR','Caterpillar'),('PERKINS','Perkins'),('FGWILSON','FG Wilson'),
('VERTIV','Vertiv'),('APC','APC by Schneider Electric'),('HUAWEI','Huawei'),
('GRUNDFOS','Grundfos'),('KSB','KSB'),('WILO','Wilo'),('XYLEM','Xylem'),
('KONE','KONE'),('OTIS','Otis'),('SCHINDLER','Schindler'),('TKE','TK Elevator'),
('AXIS','Axis Communications'),('HIKVISION','Hikvision'),('DAHUA','Dahua')
on conflict(code) do update set name=excluded.name;

-- Common manufacturer/type options.
insert into public.bf_master_asset_options(asset_type_id,manufacturer_id,model_family)
select t.id,m.id,x.family from (values
('HVAC-SPLIT','ZAMIL','Residential / Commercial Split'),('HVAC-PACKAGE','ZAMIL','Package Units'),('HVAC-PACKAGE','CARRIER','Package Units'),('HVAC-AHU','CARRIER','AHU'),('HVAC-AHU','TRANE','AHU'),('HVAC-CHILLER-AIR','CARRIER','Air-Cooled Chiller'),('HVAC-CHILLER-WATER','CARRIER','Water-Cooled Chiller'),('HVAC-CHILLER-AIR','TRANE','Air-Cooled Chiller'),('HVAC-CHILLER-WATER','TRANE','Water-Cooled Chiller'),('HVAC-CHILLER-AIR','YORK','Air-Cooled Chiller'),('HVAC-CHILLER-WATER','YORK','Water-Cooled Chiller'),('HVAC-VRF','DAIKIN','VRF'),('HVAC-VRF','MITSUBISHI','VRF'),
('BMS-SERVER','JCI','Metasys'),('BMS-CONTROLLER','JCI','Metasys Controllers'),('BMS-SERVER','HONEYWELL','BMS / Niagara Platform'),('BMS-CONTROLLER','HONEYWELL','BMS Controllers'),('BMS-SERVER','SIEMENS','Building Automation'),
('FIRE-ALARM-PANEL','NOTIFIER','Addressable Fire Alarm'),('FIRE-ALARM-PANEL','SIMPLEX','Addressable Fire Alarm'),('FIRE-ALARM-PANEL','SIEMENS','Addressable Fire Alarm'),('FIRE-ALARM-PANEL','BOSCH','Addressable Fire Alarm'),('FIRE-FM200','KIDDE','FM-200'),('FIRE-FM200','ANSUL','FM-200'),('FIRE-NOVEC','KIDDE','Existing Novec 1230'),('FIRE-NOVEC','ANSUL','Existing Novec 1230'),
('ELEC-GENERATOR','CUMMINS','Diesel Generator'),('ELEC-GENERATOR','CATERPILLAR','Diesel Generator'),('ELEC-GENERATOR','FGWILSON','Diesel Generator'),('ELEC-UPS','VERTIV','UPS'),('ELEC-UPS','APC','UPS'),('ELEC-UPS','EATON','UPS'),('DC-CRAC','VERTIV','Precision Cooling'),('DC-PDU','VERTIV','PDU'),('DC-PDU','APC','PDU'),
('PLUMB-BOOSTER','GRUNDFOS','Booster Pumps'),('PLUMB-BOOSTER','KSB','Booster Pumps'),('LIFT','KONE','Elevator'),('LIFT','OTIS','Elevator'),('LIFT','SCHINDLER','Elevator'),('SEC-CCTV','AXIS','IP Camera'),('SEC-CCTV','HIKVISION','IP Camera'),('SEC-CCTV','DAHUA','IP Camera')
) x(type_code,mfg_code,family)
join public.bf_master_asset_types t on t.code=x.type_code
join public.bf_master_manufacturers m on m.code=x.mfg_code
on conflict do nothing;

-- Generic PPM templates for key facility assets.
insert into public.bf_master_ppm_templates(asset_type_id,title_ar,title_en,frequency,estimated_minutes,reference)
select t.id,x.ar,x.en,x.freq,x.mins,'Master facility maintenance library' from (values
('HVAC-SPLIT','صيانة شهرية لمكيف سبليت','Monthly Split AC Maintenance','monthly',45),
('HVAC-PACKAGE','صيانة شهرية لوحدة باكيج','Monthly Package Unit Maintenance','monthly',90),
('HVAC-AHU','صيانة شهرية AHU','Monthly AHU Maintenance','monthly',90),
('HVAC-FCU','صيانة شهرية FCU','Monthly FCU Maintenance','monthly',45),
('HVAC-CHILLER-AIR','فحص شهري للشيلر الهوائي','Monthly Air-Cooled Chiller Inspection','monthly',120),
('HVAC-CHILLER-WATER','فحص شهري للشيلر المائي','Monthly Water-Cooled Chiller Inspection','monthly',150),
('HVAC-COOLING-TOWER','صيانة شهرية لبرج التبريد','Monthly Cooling Tower Maintenance','monthly',120),
('BMS-SERVER','فحص شهري لنظام BMS','Monthly BMS Health Check','monthly',90),
('FIRE-ALARM-PANEL','اختبار شهري لنظام إنذار الحريق','Monthly Fire Alarm System Test','monthly',90),
('FIRE-FM200','فحص شهري لنظام FM-200','Monthly FM-200 Inspection','monthly',60),
('FIRE-NOVEC','فحص شهري لنظام Novec القائم','Monthly Existing Novec System Inspection','monthly',60),
('FIRE-PUMP','اختبار أسبوعي لمضخة الحريق','Weekly Fire Pump Test','weekly',60),
('ELEC-GENERATOR','فحص شهري للمولد','Monthly Generator Inspection','monthly',90),
('ELEC-UPS','فحص شهري UPS','Monthly UPS Inspection','monthly',60),
('ELEC-TRANSFORMER','فحص ربع سنوي للمحول','Quarterly Transformer Inspection','quarterly',120),
('PLUMB-BOOSTER','صيانة شهرية لمضخة التقوية','Monthly Booster Pump Maintenance','monthly',60),
('LIFT','فحص شهري للمصعد','Monthly Elevator Inspection','monthly',90),
('DC-CRAC','صيانة شهرية للتكييف الدقيق','Monthly Precision Cooling Maintenance','monthly',90)
) x(code,ar,en,freq,mins)
join public.bf_master_asset_types t on t.code=x.code
where not exists(select 1 from public.bf_master_ppm_templates p where p.asset_type_id=t.id and p.title_en=x.en);

-- Reusable checklist steps by template title.
insert into public.bf_master_ppm_steps(template_id,seq,title_ar,title_en,task_type,response_type,unit,safety_notes)
select p.id,s.seq,s.ar,s.en,s.task,s.resp,s.unit,s.safety from public.bf_master_ppm_templates p
join (values
('Monthly Split AC Maintenance',1,'تنظيف الفلاتر','Clean filters','cleaning','pass_fail',null,'Isolate electrical supply before opening unit'),
('Monthly Split AC Maintenance',2,'فحص ملفات المبخر والمكثف','Inspect evaporator and condenser coils','inspection','pass_fail',null,null),
('Monthly Split AC Maintenance',3,'قياس حرارة الهواء الداخل والخارج','Measure return and supply air temperature','test','reading','°C',null),
('Monthly Split AC Maintenance',4,'فحص التصريف والتسريب','Check drain and leakage','inspection','pass_fail',null,null),
('Monthly Split AC Maintenance',5,'فحص التيار والضوضاء والاهتزاز','Check current, noise and vibration','inspection','pass_fail',null,null),
('Monthly Package Unit Maintenance',1,'تنظيف أو استبدال الفلاتر','Clean or replace filters','replacement','pass_fail',null,'Apply lockout/tagout'),
('Monthly Package Unit Maintenance',2,'فحص السيور والمحامل','Inspect belts and bearings','inspection','pass_fail',null,null),
('Monthly Package Unit Maintenance',3,'تنظيف ملفات المكثف','Clean condenser coils','cleaning','pass_fail',null,null),
('Monthly Package Unit Maintenance',4,'فحص الضاغط ودائرة التبريد','Inspect compressor and refrigeration circuit','inspection','pass_fail',null,null),
('Monthly Package Unit Maintenance',5,'تسجيل تيار التشغيل ودرجات الحرارة','Record running current and temperatures','test','text',null,null),
('Monthly AHU Maintenance',1,'فحص وتنظيف الفلاتر','Inspect and clean filters','cleaning','pass_fail',null,'Apply lockout/tagout'),
('Monthly AHU Maintenance',2,'فحص السيور وشدها','Inspect and adjust belts','adjustment','pass_fail',null,null),
('Monthly AHU Maintenance',3,'فحص المحرك والمحامل','Inspect motor and bearings','inspection','pass_fail',null,null),
('Monthly AHU Maintenance',4,'فحص ملفات التبريد وصينية التصريف','Inspect cooling coil and drain pan','inspection','pass_fail',null,null),
('Monthly AHU Maintenance',5,'فحص الدامبرز والحساسات','Inspect dampers and sensors','inspection','pass_fail',null,null),
('Monthly Air-Cooled Chiller Inspection',1,'فحص الإنذارات وسجل الأعطال','Review alarms and fault history','inspection','pass_fail',null,null),
('Monthly Air-Cooled Chiller Inspection',2,'تنظيف وفحص ملفات المكثف','Inspect and clean condenser coils','cleaning','pass_fail',null,'Follow manufacturer electrical isolation procedure'),
('Monthly Air-Cooled Chiller Inspection',3,'تسجيل ضغط وحرارة دائرة التبريد','Record refrigeration pressures and temperatures','test','text',null,null),
('Monthly Air-Cooled Chiller Inspection',4,'تسجيل درجات مياه الدخول والخروج','Record entering/leaving water temperatures','test','text','°C',null),
('Monthly Air-Cooled Chiller Inspection',5,'فحص الضواغط والمراوح والاهتزاز','Inspect compressors, fans and vibration','inspection','pass_fail',null,null),
('Monthly Water-Cooled Chiller Inspection',1,'فحص الإنذارات وسجل الأعطال','Review alarms and fault history','inspection','pass_fail',null,null),
('Monthly Water-Cooled Chiller Inspection',2,'تسجيل درجات مياه المبخر والمكثف','Record evaporator and condenser water temperatures','test','text','°C',null),
('Monthly Water-Cooled Chiller Inspection',3,'فحص ضغط الزيت والتبريد','Check oil and refrigerant conditions','inspection','pass_fail',null,null),
('Monthly Water-Cooled Chiller Inspection',4,'فحص المضخات والتدفق','Inspect pumps and flow','inspection','pass_fail',null,null),
('Monthly Water-Cooled Chiller Inspection',5,'فحص الكفاءة والاقتراب الحراري','Review efficiency and approach temperatures','test','text',null,null),
('Monthly BMS Health Check',1,'فحص حالة السيرفر والنسخ الاحتياطي','Check server health and backup','inspection','pass_fail',null,null),
('Monthly BMS Health Check',2,'فحص اتصالات BACnet/Modbus','Check BACnet/Modbus communications','test','pass_fail',null,null),
('Monthly BMS Health Check',3,'مراجعة الإنذارات الحرجة','Review critical alarms','inspection','pass_fail',null,null),
('Monthly BMS Health Check',4,'مراجعة الاتجاهات والتوقيت','Review trends and time synchronization','inspection','pass_fail',null,null),
('Monthly BMS Health Check',5,'فحص عينات الحساسات والمشغلات','Sample-check sensors and actuators','test','pass_fail',null,null),
('Monthly Fire Alarm System Test',1,'فحص حالة اللوحة والبطاريات','Inspect panel and batteries','inspection','pass_fail',null,'Coordinate with fire safety control room before tests'),
('Monthly Fire Alarm System Test',2,'مراجعة الأعطال والإنذارات','Review faults and alarms','inspection','pass_fail',null,null),
('Monthly Fire Alarm System Test',3,'اختبار عينة من الكواشف ونقاط النداء','Test sample detectors and manual call points','test','pass_fail',null,null),
('Monthly Fire Alarm System Test',4,'اختبار أجهزة التنبيه والربط','Test notification and interfaces','test','pass_fail',null,null),
('Monthly Fire Alarm System Test',5,'توثيق المناطق والأجهزة المختبرة','Document zones and devices tested','other','text',null,null),
('Monthly FM-200 Inspection',1,'فحص ضغط الأسطوانات ومؤشراتها','Inspect cylinder pressure indicators','inspection','pass_fail',null,'Do not actuate release circuit during routine inspection'),
('Monthly FM-200 Inspection',2,'فحص المواسير والفوهات','Inspect piping and nozzles','inspection','pass_fail',null,null),
('Monthly FM-200 Inspection',3,'فحص دائرة الكشف والإطلاق','Inspect detection and release circuit','test','pass_fail',null,null),
('Monthly FM-200 Inspection',4,'فحص سلامة الغرفة والفتحات','Inspect enclosure integrity condition','inspection','pass_fail',null,null),
('Monthly Existing Novec System Inspection',1,'فحص الأسطوانات والضغط','Inspect cylinders and pressure','inspection','pass_fail',null,'Treat as existing installed clean-agent system'),
('Monthly Existing Novec System Inspection',2,'فحص المواسير والفوهات','Inspect piping and nozzles','inspection','pass_fail',null,null),
('Monthly Existing Novec System Inspection',3,'فحص دائرة الكشف والإطلاق','Inspect detection and release circuit','test','pass_fail',null,null),
('Weekly Fire Pump Test',1,'فحص مستوى الوقود/الطاقة','Check fuel/power availability','inspection','pass_fail',null,null),
('Weekly Fire Pump Test',2,'تشغيل المضخة وتسجيل الضغط','Run pump and record pressure','test','reading','bar','Coordinate with fire system operator'),
('Weekly Fire Pump Test',3,'فحص التسريب والاهتزاز والضوضاء','Check leakage, vibration and noise','inspection','pass_fail',null,null),
('Weekly Fire Pump Test',4,'فحص مضخة الجوكي','Check jockey pump operation','test','pass_fail',null,null),
('Monthly Generator Inspection',1,'فحص الزيت وسائل التبريد والوقود','Check oil, coolant and fuel','inspection','pass_fail',null,null),
('Monthly Generator Inspection',2,'فحص البطارية والشاحن','Inspect battery and charger','inspection','pass_fail',null,null),
('Monthly Generator Inspection',3,'تشغيل تجريبي وتسجيل الجهد والتردد','Test run and record voltage/frequency','test','text',null,'Follow generator operating procedure'),
('Monthly Generator Inspection',4,'فحص التسريب والاهتزاز والعادم','Check leaks, vibration and exhaust','inspection','pass_fail',null,null),
('Monthly Generator Inspection',5,'اختبار ATS إن كان مسموحاً','Test ATS where permitted','test','pass_fail',null,'Coordinate before transfer test'),
('Monthly UPS Inspection',1,'مراجعة الإنذارات وسجل الأحداث','Review alarms and event log','inspection','pass_fail',null,null),
('Monthly UPS Inspection',2,'فحص حالة البطاريات','Inspect battery condition','inspection','pass_fail',null,'Use electrical PPE'),
('Monthly UPS Inspection',3,'تسجيل الحمل والجهد','Record load and voltage','test','text',null,null),
('Quarterly Transformer Inspection',1,'فحص بصري ونظافة المحول','Visual inspection and cleanliness','inspection','pass_fail',null,'Qualified electrical personnel only'),
('Quarterly Transformer Inspection',2,'فحص الحرارة والتهوية','Check temperature and ventilation','inspection','pass_fail',null,null),
('Quarterly Transformer Inspection',3,'فحص التوصيلات والتسريب','Inspect connections and leakage','inspection','pass_fail',null,null),
('Monthly Booster Pump Maintenance',1,'فحص التسريب والضغط','Check leakage and pressure','inspection','pass_fail',null,null),
('Monthly Booster Pump Maintenance',2,'فحص المحرك والمحامل','Inspect motor and bearings','inspection','pass_fail',null,null),
('Monthly Booster Pump Maintenance',3,'تسجيل ضغط السحب والطرد','Record suction/discharge pressure','test','text','bar',null),
('Monthly Elevator Inspection',1,'فحص الأبواب والحساسات','Inspect doors and sensors','inspection','pass_fail',null,'Authorized elevator maintenance personnel only'),
('Monthly Elevator Inspection',2,'فحص التشغيل والتوقف والمحاذاة','Check operation, stopping and leveling','test','pass_fail',null,null),
('Monthly Elevator Inspection',3,'فحص الإنذار والاتصال','Test alarm and communication','test','pass_fail',null,null),
('Monthly Precision Cooling Maintenance',1,'تنظيف الفلاتر والملفات','Clean filters and coils','cleaning','pass_fail',null,'Coordinate with data center operations'),
('Monthly Precision Cooling Maintenance',2,'فحص الإنذارات والتصريف','Check alarms and drain','inspection','pass_fail',null,null),
('Monthly Precision Cooling Maintenance',3,'تسجيل الحرارة والرطوبة','Record temperature and humidity','test','text',null,null)
) s(template_en,seq,ar,en,task,resp,unit,safety) on p.title_en=s.template_en
on conflict(template_id,seq) do nothing;

create or replace function public.bf_master_adopt_templates(p_org uuid,p_asset_type uuid,p_manufacturer uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare t public.bf_master_asset_types; m public.bf_master_manufacturers; cat uuid; p record; proc uuid; n integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not public.bf_can(p_org,'assets.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
 select * into t from public.bf_master_asset_types where id=p_asset_type and status='active';
 if not found then raise exception 'Asset type not found'; end if;
 if p_manufacturer is not null then select * into m from public.bf_master_manufacturers where id=p_manufacturer and status='active'; if not found then raise exception 'Manufacturer not found'; end if; end if;
 select id into cat from public.bf_asset_categories where organization_id=p_org and code=t.code;
 if cat is null then insert into public.bf_asset_categories(organization_id,code,name_ar,name_en,description) values(p_org,t.code,t.name_ar,t.name_en,coalesce(t.description_en,t.name_en)) returning id into cat; end if;
 for p in select * from public.bf_master_ppm_templates x where x.asset_type_id=t.id and x.status='active' and (x.manufacturer_id is null or x.manufacturer_id=p_manufacturer) order by x.frequency loop
  if not exists(select 1 from public.bf_ppm_procedures z where z.organization_id=p_org and z.category_id=cat and z.name_en=p.title_en and z.status<>'archived') then
   insert into public.bf_ppm_procedures(organization_id,code,name_ar,name_en,category_id,manufacturer,frequency,status,reference,estimated_minutes,created_by)
   values(p_org,'LIB-'||left(replace(t.code,'-',''),12)||'-'||left(replace(p.id::text,'-',''),8),p.title_ar,p.title_en,cat,case when p_manufacturer is null then null else m.name end,p.frequency,'approved',p.reference,p.estimated_minutes,auth.uid()) returning id into proc;
   insert into public.bf_ppm_steps(procedure_id,seq,title_ar,title_en,instructions_ar,instructions_en,task_type,response_type,unit,safety_notes,tools,materials)
   select proc,s.seq,s.title_ar,s.title_en,s.instructions_ar,s.instructions_en,s.task_type,s.response_type,s.unit,s.safety_notes,s.tools,s.materials from public.bf_master_ppm_steps s where s.template_id=p.id order by s.seq;
   n:=n+1;
  end if;
 end loop;
 return jsonb_build_object('category_id',cat,'procedures_created',n,'asset_type',t.name_en,'manufacturer',m.name);
end $$;
revoke all on function public.bf_master_adopt_templates(uuid,uuid,uuid) from public,anon;
grant execute on function public.bf_master_adopt_templates(uuid,uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
