import {supabase} from './supabaseClient'

function isoDate(d){
 return d.toISOString().slice(0,10)
}

export async function loadExecutiveDashboard(f={}){
 const to=f.to||isoDate(new Date())
 const from=f.from||isoDate(new Date(Date.now()-30*24*60*60*1000))
 const {data,error}=await supabase.rpc('bf28_dashboard',{
  p_org:f.organization_id||null,
  p_client:f.client_id||null,
  p_from:from,
  p_to:to
 })
 if(error)throw error
 return data
}
