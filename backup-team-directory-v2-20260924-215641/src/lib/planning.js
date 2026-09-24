import {supabase} from './supabaseClient'

export async function loadPlanning(filters={}){
 const {data,error}=await supabase.rpc('bf18_calendar',{
  p_org:filters.organization_id||null,
  p_client:filters.client_id||null,
  p_from:filters.from||null,
  p_to:filters.to||null,
  p_source:filters.source||null,
  p_limit:filters.limit||500
 })
 if(error) throw error
 return data
}
