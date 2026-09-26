-- BASMAT MEDICAL CMMS
-- Verified example seed data for Medical Maintenance Companies Library
-- Public-source reference data. Review/verify before procurement or contracting.
-- Safe to re-run: keyed by code.

begin;

insert into public.bf_med_service_companies
(
  code,name_ar,name_en,company_type,specialties,regions,
  license_reference,accreditation,sla_hours,emergency_support,
  contact_name,phone,email,website,notes,status
)
values
(
  'SMEH',
  'دار المعدات الطبية والعلمية',
  'Scientific & Medical Equipment House',
  'medical_maintenance',
  array['Medical equipment maintenance','Hospital equipment repair','Operations & maintenance'],
  array['Saudi Arabia'],
  null,null,null,false,
  null,'+966 11 464 6699','smeh@smeh.com.sa','https://www.smeh.com.sa/en',
  'Public reference: company states it provides medical equipment maintenance and repair services across Saudi Arabia. Verify current scope and contractual qualifications before use.',
  'active'
),
(
  'AFMS',
  'الفيصلية للأنظمة الطبية',
  'Al Faisaliah Medical Systems',
  'medical_maintenance',
  array['Biomedical service','Preventive maintenance','Field service','Installation','Remote support'],
  array['Riyadh','Jeddah','Dammam','Abha','Madinah','Qassim','Makkah','Taif','Jizan'],
  null,null,null,false,
  null,'+966 11 476 7777','afms@afmssc.com','https://www.mhlf.sa/supportive-functions/customer-support-biomedical-services',
  'Public reference: AFMS states its biomedical service covers installation, training, planned preventive maintenance, field service, recalls/field change orders and remote support.',
  'active'
),
(
  'DALMED',
  'دال ميد',
  'Dalmed',
  'medical_maintenance',
  array['Clinical engineering','Preventive maintenance','Corrective maintenance','Inspection','Manufacturer after-sales support'],
  array['Riyadh','Saudi Arabia'],
  null,null,null,false,
  null,'+966 11 415 5593',null,'https://dal-med.com/our-services/medical-equipment-maintenance/',
  'Public reference: Dalmed describes hospital clinical engineering, inspections, PPM, repairs and manufacturer after-sales support in Saudi Arabia.',
  'active'
),
(
  'DEAAM',
  'دعم للمعدات الطبية',
  'Deaam Medical Equipment',
  'medical_maintenance',
  array['Biomedical maintenance','Preventive maintenance','Corrective maintenance','Calibration','Long-term maintenance contracts'],
  array['Saudi Arabia'],
  null,null,null,false,
  null,null,null,'https://deaam.com/maintenance/',
  'Public reference: Deaam states it provides biomedical maintenance, troubleshooting, repair, PPM and calibration across Saudi Arabia.',
  'active'
),
(
  'SOMATCO',
  'الشركة السعودية للتسويق والتجارة',
  'SOMATCO',
  'medical_maintenance',
  array['Medical equipment service','Laboratory equipment service','Repair','Calibration','Technical application support'],
  array['Riyadh','Saudi Arabia'],
  null,null,null,false,
  null,null,null,'https://www.somatco.com/service/',
  'Public reference: SOMATCO states its Riyadh Technical Service Department provides repair, calibration, troubleshooting and technical support for equipment it supplies across Saudi Arabia.',
  'active'
),
(
  'ALBASAR',
  'البصر للتجهيزات الطبية',
  'Al Basar Medical Supplies',
  'medical_maintenance',
  array['Ophthalmic equipment','Installation','Preventive maintenance','Troubleshooting','Technical assistance'],
  array['Western Region','Eastern Region','Saudi Arabia'],
  null,null,null,false,
  'Service Department',null,'service@albasarmedical.com.sa','https://www.albasarmedical.com.sa/service-request/',
  'Public reference: Al Basar states its service engineers provide installation, technical assistance, preventive maintenance and troubleshooting for ophthalmic equipment.',
  'active'
),
(
  'RICMED',
  'مؤسسة الرياض الدولية للحلول الطبية',
  'RIC Medical Solutions',
  'medical_maintenance',
  array['Medical equipment service','Preventive maintenance','Corrective maintenance','Urology','Lithotripsy','Endoscopy','Medical lasers'],
  array['Riyadh','Saudi Arabia'],
  null,null,null,true,
  null,'+966 11 463 0135','ricmede@ricmedical.com.sa','https://www.ricmedical.com.sa/',
  'Public reference: RIC states it provides installation-to-maintenance support, nationwide coverage and 24/7 technical support. Verify OEM authorizations for each brand before contracting.',
  'active'
),
(
  'ZAHRAWI-KSA',
  'دار الزهراوي الطبية',
  'Dar Al Zahrawi Medical LLC',
  'medical_maintenance',
  array['Biomedical engineering','Maintenance management','Medical imaging','Laboratory','Respiratory','Medical equipment','After-sales support'],
  array['Riyadh','Jeddah','Al Khobar','Saudi Arabia'],
  null,null,null,false,
  null,'+966 11 230 5533','info.ksa@zahrawigroup.com','https://www.zahrawigroup.com/service/',
  'Public reference: Zahrawi states its Service Unit provides maintenance management and biomedical engineering support; the group lists Saudi operations in Riyadh, Jeddah and Al Khobar.',
  'active'
),
(
  'TMI-BIOMED',
  'تي إم آي للطب الحيوي',
  'TMI Biomedical',
  'medical_maintenance',
  array['Biomedical equipment repair','Preventive maintenance','Emergency repair','Calibration','Training'],
  array['Riyadh','Saudi Arabia'],
  null,null,null,true,
  null,'+966 55 389 4139','info@tmibiomedical.com','https://tmibiomedical.com/',
  'Public reference: TMI Biomedical states it provides local repair and maintenance facilities, preventive maintenance, emergency repair and calibration in Riyadh.',
  'active'
),
(
  'PHILIPS-HC',
  'فيليبس للرعاية الصحية',
  'Philips Healthcare',
  'oem_service',
  array['OEM maintenance','Remote service','Proactive maintenance','Fleet service management'],
  array['Saudi Arabia'],
  null,null,null,false,
  null,null,null,'https://www.philips.sa/healthcare/en-SA/service/maintenance-service-agreements',
  'OEM service reference: Philips Saudi healthcare pages describe maintenance service agreements and customer service/fleet maintenance capabilities. This record does not imply third-party authorization.',
  'active'
),
(
  'SIEMENS-H',
  'سيمنس هيلثينيرز',
  'Siemens Healthineers',
  'oem_service',
  array['Planned maintenance','Corrective maintenance','Application support','Diagnostic equipment service'],
  array['Saudi Arabia'],
  null,null,null,false,
  null,null,null,'https://www.siemens-healthineers.com/en-sa/services/customer-services/uptime-services',
  'OEM service reference: Siemens Healthineers Saudi pages describe planned and corrective maintenance plus application support. This record does not imply third-party authorization.',
  'active'
),
(
  'DRAEGER-KSA',
  'دريغر السعودية',
  'Dräger',
  'oem_service',
  array['Medical device service','Preventive maintenance','Inspection','Repair','Critical care equipment'],
  array['Saudi Arabia'],
  null,null,null,false,
  null,null,null,'https://www.draeger.com/en_sa/Hospital/Draeger-Medical-Services/Medical-Device-Service-Repair',
  'OEM service reference: Dräger Saudi pages describe inspection, maintenance and repair services for Dräger medical systems. This record does not imply third-party authorization.',
  'active'
)
on conflict (code) do update set
  name_ar=excluded.name_ar,
  name_en=excluded.name_en,
  company_type=excluded.company_type,
  specialties=excluded.specialties,
  regions=excluded.regions,
  phone=excluded.phone,
  email=excluded.email,
  website=excluded.website,
  notes=excluded.notes,
  status='active',
  updated_at=now();

notify pgrst,'reload schema';

commit;
