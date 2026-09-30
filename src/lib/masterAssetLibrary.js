import {supabase} from './supabaseClient'

async function rpc(name,args){
 const {data,error}=await supabase.rpc(name,args)
 if(error)throw error
 return data
}

export async function loadMasterAssetLibrary(){
 const defs=[
  ['types','bf_med_master_types'],
  ['manufacturers','bf_med_manufacturers'],
  ['options','bf_med_master_options'],
  ['templates','bf_med_master_pm_templates'],
  ['steps','bf_med_master_pm_steps'],
  ['organizations','bf_organizations']
 ]

 const out=await Promise.all(
  defs.map(async([key,table])=>{
   let q=supabase.from(table).select('*')

   if(!['bf_med_master_options','bf_med_master_pm_steps'].includes(table)){
    q=q.order('created_at',{ascending:true})
   }

   const {data,error}=await q
   if(error)throw error

   return [key,data||[]]
  })
 )

 return Object.fromEntries(out)
}


// Medical catalog report only.
// Do not use Facilities bf_master_asset_catalog_report.
export async function loadMasterAssetCatalogReport(){
 const data=await loadMasterAssetLibrary()

 const manufacturerById=new Map(
  (data.manufacturers||[]).map(x=>[x.id,x])
 )

 return (data.types||[]).map(t=>{
  const options=(data.options||[])
   .filter(o=>o.asset_type_id===t.id)
   .map(o=>({
    ...o,
    manufacturer:manufacturerById.get(o.manufacturer_id)||null
   }))

  const templates=(data.templates||[])
   .filter(x=>x.asset_type_id===t.id)

  return {
   ...t,
   options,
   templates
  }
 })
}


// Medical architecture:
// PM template is resolved automatically during physical asset registration.
export async function adoptMasterTemplates(org,type,manufacturer=null){
 return rpc('bf_med_adopt_templates',{
  p_org:org,
  p_asset_type:type,
  p_manufacturer:manufacturer||null
 })
}


// =========================================================
// MEDICAL DEVICE TYPE
// =========================================================
export const saveMasterAsset=v=>rpc('bf_med_admin_type_upsert',{
 p_id:v.id||null,
 p_system_code:v.system_code||'MEDICAL',
 p_code:v.code,
 p_name_ar:v.name_ar,
 p_name_en:v.name_en,
 p_icon:v.icon_text||'🏥',
 p_criticality:v.default_criticality||'high',
 p_pm_months:
  v.default_pm_months!==undefined && v.default_pm_months!==''
   ? Number(v.default_pm_months)
   : 12,
 p_cal_months:
  v.default_calibration_months!==undefined &&
  v.default_calibration_months!==''
   ? Number(v.default_calibration_months)
   : 12,
 p_procurement:v.procurement_class||'standard',
 p_lead_days:
  v.default_lead_time_days
   ? Number(v.default_lead_time_days)
   : 45
})


// =========================================================
// MEDICAL MANUFACTURER
// =========================================================
export const saveMasterManufacturer=v=>rpc(
 'bf_med_admin_manufacturer_upsert',
 {
  p_id:v.id||null,
  p_code:v.code,
  p_name:v.name
 }
)


// =========================================================
// MEDICAL MODEL / OPTION
// =========================================================
export const saveMasterOption=v=>rpc(
 'bf_med_admin_option_upsert',
 {
  p_id:v.id||null,
  p_asset_type_id:v.asset_type_id,
  p_manufacturer_id:v.manufacturer_id,
  p_model_family:v.model_family||null
 }
)


// Convert old UI frequency field to Medical interval_months.
function frequencyToMonths(value){
 if(value===null || value===undefined || value==='')return 12

 if(!Number.isNaN(Number(value))){
  return Math.max(1,Number(value))
 }

 const x=String(value).toLowerCase().trim()

 const map={
  monthly:1,
  bimonthly:2,
  quarterly:3,
  four_monthly:4,
  semiannual:6,
  semi_annual:6,
  biannual:6,
  annual:12,
  yearly:12,
  '2_years':24,
  biennial:24
 }

 return map[x]||12
}


// =========================================================
// MEDICAL PM TEMPLATE
// =========================================================
export const saveMasterTemplate=v=>rpc(
 'bf_med_admin_template_upsert',
 {
  p_id:v.id||null,
  p_asset_type_id:v.asset_type_id,
  p_manufacturer_id:v.manufacturer_id||null,
  p_title_ar:v.title_ar,
  p_title_en:v.title_en,
  p_interval_months:
   v.interval_months
    ? Number(v.interval_months)
    : frequencyToMonths(v.frequency),
  p_reference:v.reference||null
 }
)


// =========================================================
// MEDICAL PM STEP
// =========================================================
export const saveMasterStep=v=>rpc(
 'bf_med_admin_step_upsert',
 {
  p_id:v.id||null,
  p_template_id:v.template_id,
  p_seq:Number(v.seq||1),
  p_title_ar:v.title_ar,
  p_title_en:v.title_en,
  p_instructions_ar:v.instructions_ar||'',
  p_instructions_en:v.instructions_en||'',
  p_task_type:v.task_type||'inspection',
  p_response_type:v.response_type||'pass_fail',
  p_unit:v.unit||null,
  p_safety_notes:v.safety_notes||null,
  p_tools:v.tools||null,
  p_materials:v.materials||null
 }
)


// =========================================================
// MEDICAL ARCHIVE / REACTIVATE
// =========================================================
export const setMasterActive=(entity,id,active)=>rpc(
 'bf_med_admin_archive',
 {
  p_entity:entity,
  p_id:id,
  p_active:!!active
 }
)