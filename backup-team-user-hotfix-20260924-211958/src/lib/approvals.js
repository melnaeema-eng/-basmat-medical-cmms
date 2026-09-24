import {supabase} from './supabaseClient'
export async function loadApprovalPortal(filters={}){
 const {data,error}=await supabase.rpc('bf11_portal',{
  p_org:filters.organization_id||null,p_client:filters.client_id||null,
  p_status:filters.status||null,p_limit:filters.limit||200,p_offset:filters.offset||0})
 if(error)throw error
 return data
}
export async function approvalAction(action,id=null,payload={}){
 const {data,error}=await supabase.rpc('bf11_action',{p_action:action,p_id:id,p_data:payload})
 if(error)throw error
 return data
}
export async function findConsultant(email,organizationId){
 const {data,error}=await supabase.rpc('bf11_find_profile',{p_email:email,p_org:organizationId})
 if(error)throw error
 return data?.[0]||null
}
export async function manageConsultant(action,userId,organizationId,clientId){
 const {error}=await supabase.rpc('bf11_consultant_manage',{
  p_action:action,p_user:userId,p_org:organizationId,p_client:clientId})
 if(error)throw error
}
