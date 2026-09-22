import {supabase} from './supabaseClient'

export async function loadUtilities(f={}){
 const {data,error}=await supabase.rpc('bf25_dashboard',{
  p_org:f.organization_id||null,
  p_site:f.site_id||null,
  p_from:f.from?new Date(f.from+'T00:00:00').toISOString():null,
  p_to:f.to?new Date(f.to+'T23:59:59.999').toISOString():null,
  p_limit:f.limit||300
 })
 if(error)throw error
 return data
}

export async function createUtilityMeter(v){
 const {data,error}=await supabase.rpc('bf25_create_meter',{
  p_site:v.site_id,
  p_asset:v.asset_id||null,
  p_code:v.code,
  p_name:v.name,
  p_type:v.meter_type,
  p_unit:v.unit,
  p_target_daily:v.target_daily?Number(v.target_daily):null,
  p_notes:v.notes||''
 })
 if(error)throw error
 return data
}

export async function addUtilityReading(v){
 const {data,error}=await supabase.rpc('bf25_add_reading',{
  p_meter:v.meter_id,
  p_reading_at:new Date(v.reading_at).toISOString(),
  p_value:Number(v.reading_value),
  p_source:'manual',
  p_notes:v.notes||''
 })
 if(error)throw error
 return data
}

export async function setUtilityMeterStatus(id,status,reason){
 const {error}=await supabase.rpc('bf25_set_status',{p_meter:id,p_status:status,p_reason:reason})
 if(error)throw error
}
