import {supabase} from './supabaseClient'

export async function loadReliability(f={}){
 const {data,error}=await supabase.rpc('bf22_dashboard',{
  p_org:f.organization_id||null,
  p_client:f.client_id||null,
  p_from:f.from?new Date(f.from+'T00:00:00').toISOString():null,
  p_to:f.to?new Date(f.to+'T23:59:59.999').toISOString():null,
  p_limit:f.limit||300
 })
 if(error)throw error
 return data
}

export async function openDowntime(v){
 const {data,error}=await supabase.rpc('bf22_open',{
  p_asset:v.asset_id,
  p_started_at:new Date(v.started_at).toISOString(),
  p_type:v.incident_type,
  p_reason:v.reason,
  p_work_order:v.work_order_id||null
 })
 if(error)throw error
 return data
}

export async function closeDowntime(id,endedAt,resolution){
 const {error}=await supabase.rpc('bf22_close',{
  p_incident:id,p_ended_at:new Date(endedAt).toISOString(),p_resolution:resolution
 })
 if(error)throw error
}

export async function cancelDowntime(id,reason){
 const {error}=await supabase.rpc('bf22_cancel',{p_incident:id,p_reason:reason})
 if(error)throw error
}
