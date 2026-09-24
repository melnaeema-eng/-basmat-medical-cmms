import {supabase} from './supabaseClient'

export async function loadKpi(filters={}){
  const {data,error}=await supabase.rpc('bf16_dashboard',{
    p_org:filters.organization_id||null,
    p_client:filters.client_id||null,
    p_from:filters.from||null,
    p_to:filters.to||null
  })
  if(error) throw error
  return data
}
