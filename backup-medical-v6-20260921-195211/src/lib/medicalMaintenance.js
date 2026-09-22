import {supabase} from './supabaseClient'

async function all(table,columns='*',build){
 const rows=[]
 for(let start=0;start<10000;start+=500){
  let q=supabase.from(table).select(columns).range(start,start+499)
  q=build?build(q):q
  const {data,error}=await q
  if(error)throw error
  rows.push(...(data||[]))
  if((data||[]).length<500)return rows
 }
 return rows
}

export async function loadMedicalCenter(){
 const [types,manufacturers,options,templates,steps,assets,history,workOrders,organizations]=await Promise.all([
  all('bf_med_master_types','*',q=>q.order('system_code').order('name_en')),
  all('bf_med_manufacturers','*',q=>q.order('name')),
  all('bf_med_master_options'),
  all('bf_med_master_pm_templates'),
  all('bf_med_master_pm_steps'),
  all('bf_med_assets','*',q=>q.order('created_at',{ascending:false})),
  all('bf_med_pm_history','*',q=>q.order('performed_at',{ascending:false})),
  all('bf_med_work_orders','*',q=>q.order('created_at',{ascending:false})),
  all('bf_organizations','id,name,code,status',q=>q.order('name'))
 ])
 return {types,manufacturers,options,templates,steps,assets,history,workOrders,organizations}
}

async function rpc(name,args){
 const {data,error}=await supabase.rpc(name,args)
 if(error)throw error
 return data
}

export const registerMedicalAsset=v=>rpc('bf_med_register_asset',{
 p_org:v.organization_id,p_master_type:v.master_type_id,p_manufacturer:v.manufacturer_id||null,
 p_asset_tag:v.asset_tag,p_model:v.model||null,p_serial:v.serial_number||null,
 p_department:v.department||'',p_site_name:v.site_name||null,p_location_text:v.location_text||null,
 p_sfda_registration:v.sfda_registration_number||null,p_risk_class:v.risk_class||null,
 p_installation_date:v.installation_date||null,p_warranty_end:v.warranty_end_date||null
})

export const completeMedicalActivity=v=>rpc('bf_med_complete_activity',{
 p_asset:v.asset_id,p_activity_type:v.activity_type,p_result:v.result,p_notes:v.notes||null,
 p_certificate:v.certificate_number||null,p_service_provider:v.service_provider||null,p_next_due:v.next_due_date||null
})

export const createMedicalWorkOrder=v=>rpc('bf_med_create_work_order',{
 p_asset:v.asset_id,p_work_type:v.work_type,p_title:v.title,p_description:v.description||'',
 p_priority:v.priority||'normal',p_due_date:v.due_date||null
})

export const saveMedicalType=v=>rpc('bf_med_admin_type_upsert',{
 p_id:v.id||null,p_system_code:v.system_code,p_code:v.code,p_name_ar:v.name_ar,p_name_en:v.name_en,
 p_icon:v.icon_text||'🏥',p_criticality:v.default_criticality||'high',
 p_pm_months:Number(v.default_pm_months||12),p_cal_months:Number(v.default_calibration_months||12),
 p_procurement:v.procurement_class||'standard',p_lead_days:Number(v.default_lead_time_days||45)
})

export const saveMedicalManufacturer=v=>rpc('bf_med_admin_manufacturer_upsert',{
 p_id:v.id||null,p_code:v.code,p_name:v.name
})
