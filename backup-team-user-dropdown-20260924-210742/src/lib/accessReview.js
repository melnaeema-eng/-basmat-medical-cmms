import {supabase} from './supabaseClient'
export async function loadAccessReview(orgId){
 const {data,error}=await supabase.rpc('bf39_dashboard',{p_org:orgId})
 if(error)throw error
 return data||{summary:{},requests:[],expiring_scopes:[]}
}
export async function createAccessRequest(v){
 const {data,error}=await supabase.rpc('bf39_request_access',{
  p_org:v.organization_id,p_type:v.request_type,p_subject:v.subject_user_id,
  p_role:v.role_id||null,p_existing_scope:v.existing_scope_id||null,
  p_scope_level:v.scope_level||null,p_client:v.client_id||null,p_contract:v.contract_id||null,
  p_site:v.site_id||null,p_discipline:v.discipline_code||null,
  p_valid_from:v.valid_from||null,p_valid_until:v.valid_until||null,p_justification:v.justification
 })
 if(error)throw error
 return data
}
export async function decideAccessRequest(id,decision,note=''){
 const {data,error}=await supabase.rpc('bf39_decide_request',{p_request:id,p_decision:decision,p_note:note||null})
 if(error)throw error
 return data
}
export async function reviewAccessScope(id,decision,note=''){
 const {error}=await supabase.rpc('bf39_review_scope',{p_scope:id,p_decision:decision,p_note:note||null})
 if(error)throw error
}
export async function processExpiredAccess(){
 const {data,error}=await supabase.rpc('bf39_process_expired')
 if(error)throw error
 return data||0
}
