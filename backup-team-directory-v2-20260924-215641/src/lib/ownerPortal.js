import {supabase} from './supabaseClient'

export async function loadOwnerPortal(clientId=null){
 const {data,error}=await supabase.rpc('bf29_portal',{p_client:clientId||null,p_limit:100})
 if(error)throw error
 return data
}
export async function createOwnerRequest(v){
 const {data,error}=await supabase.rpc('bf4_action',{
  p_kind:'request',p_id:null,p_action:'create',
  p_data:{
   organization_id:v.organization_id,client_id:v.client_id,site_id:v.site_id,
   contract_id:v.contract_id||null,asset_id:v.asset_id||null,
   title:v.title,description:v.description||'',priority:v.priority||'P3'
  }
 })
 if(error)throw error
 return data
}
export async function decideOwnerApproval(id,decision,comment=''){
 const {data,error}=await supabase.rpc('bf11_action',{
  p_action:decision,p_id:id,p_data:{comment}
 })
 if(error)throw error
 return data
}
