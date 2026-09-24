import {supabase} from './supabaseClient'

export async function loadContractRenewal(f={}){
 const {data,error}=await supabase.rpc('bf27_dashboard',{
  p_org:f.organization_id||null,
  p_client:f.client_id||null,
  p_horizon_days:Number(f.horizon_days||120),
  p_limit:Number(f.limit||300)
 })
 if(error)throw error
 return data
}

export async function updateContractRenewal(v){
 const {data,error}=await supabase.rpc('bf27_update_renewal',{
  p_contract:v.contract_id,
  p_status:v.renewal_status,
  p_target_date:v.target_date||null,
  p_note:v.note||''
 })
 if(error)throw error
 return data
}
