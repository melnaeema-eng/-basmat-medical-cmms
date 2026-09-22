import {supabase} from './supabaseClient'

export async function loadMasterAssetLibrary(){
 const defs=[
  ['types','bf_med_master_types'],
  ['manufacturers','bf_med_manufacturers'],
  ['options','bf_med_master_options'],
  ['templates','bf_med_master_pm_templates'],
  ['steps','bf_med_master_pm_steps'],
  ['organizations','bf_organizations']
 ]
 const out=await Promise.all(defs.map(async([key,table])=>{
  let q=supabase.from(table).select('*')
  if(!['bf_med_master_options','bf_med_master_pm_steps'].includes(table))q=q.order('created_at',{ascending:true})
  const {data,error}=await q
  if(error)throw error
  return [key,data||[]]
 }))
 return Object.fromEntries(out)
}

export async function loadMasterAssetCatalogReport(){
 const {data,error}=await supabase.from('bf_master_asset_catalog_report').select('*').order('system_code').order('name_en')
 if(error)throw error
 return data||[]
}

export async function adoptMasterTemplates(org,type,manufacturer=null){
 const {data,error}=await supabase.rpc('bf_master_adopt_templates',{
  p_org:org,p_asset_type:type,p_manufacturer:manufacturer||null
 })
 if(error)throw error
 return data
}

async function rpc(name,args){
 const {data,error}=await supabase.rpc(name,args)
 if(error)throw error
 return data
}

export const saveMasterAsset=v=>rpc('bf_master_admin_asset_upsert',{
 p_id:v.id||null,p_system_code:v.system_code,p_code:v.code,p_name_ar:v.name_ar,p_name_en:v.name_en,
 p_icon_text:v.icon_text||'🔧',p_group_ar:v.group_ar||null,p_group_en:v.group_en||null,
 p_description_ar:v.description_ar||null,p_description_en:v.description_en||null,
 p_default_criticality:v.default_criticality||'medium',
 p_expected_life_years:v.expected_life_years?Number(v.expected_life_years):null,
 p_procurement_class:v.procurement_class||'standard',
 p_default_lead_time_days:v.default_lead_time_days?Number(v.default_lead_time_days):null,
 p_critical_spare:!!v.critical_spare,p_stock_strategy:v.stock_strategy||null
})

export const saveMasterManufacturer=v=>rpc('bf_master_admin_manufacturer_upsert',{
 p_id:v.id||null,p_code:v.code,p_name:v.name,p_short_name:v.short_name||null,p_website:v.website||null
})

export const saveMasterOption=v=>rpc('bf_master_admin_option_upsert',{
 p_id:v.id||null,p_asset_type_id:v.asset_type_id,p_manufacturer_id:v.manufacturer_id,
 p_model_family:v.model_family||null,p_notes:v.notes||null
})

export const saveMasterTemplate=v=>rpc('bf_master_admin_template_upsert',{
 p_id:v.id||null,p_asset_type_id:v.asset_type_id,p_manufacturer_id:v.manufacturer_id||null,
 p_title_ar:v.title_ar,p_title_en:v.title_en,p_frequency:v.frequency||'monthly',
 p_estimated_minutes:Number(v.estimated_minutes||60),p_reference:v.reference||null
})

export const saveMasterStep=v=>rpc('bf_master_admin_step_upsert',{
 p_id:v.id||null,p_template_id:v.template_id,p_seq:Number(v.seq||1),
 p_title_ar:v.title_ar,p_title_en:v.title_en,p_instructions_ar:v.instructions_ar||'',
 p_instructions_en:v.instructions_en||'',p_task_type:v.task_type||'inspection',
 p_response_type:v.response_type||'pass_fail',p_unit:v.unit||null,p_safety_notes:v.safety_notes||null,
 p_tools:v.tools||null,p_materials:v.materials||null
})

export const setMasterActive=(entity,id,active)=>rpc('bf_master_admin_archive',{
 p_entity:entity,p_id:id,p_active:!!active
})
