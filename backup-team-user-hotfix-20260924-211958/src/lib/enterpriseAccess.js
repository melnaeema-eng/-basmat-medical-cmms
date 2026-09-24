import {supabase} from './supabaseClient'
export async function loadEnterpriseAccess(orgId){
 const {data,error}=await supabase.rpc('bf34_access_matrix',{p_org:orgId})
 if(error)throw error
 return data
}
export async function assignEnterpriseScope(v){
 const {data,error}=await supabase.rpc('bf34_assign_scope',{
  p_user:v.user_id,p_org:v.organization_id,p_role:v.role_id,p_scope_level:v.scope_level,
  p_client:v.client_id||null,p_contract:v.contract_id||null,p_site:v.site_id||null,
  p_discipline:v.discipline_code||null,p_valid_from:v.valid_from||null,p_valid_until:v.valid_until||null
 })
 if(error)throw error
 return data
}
export async function setEnterpriseScopeActive(id,active){
 const {error}=await supabase.rpc('bf34_set_scope_active',{p_scope:id,p_active:active})
 if(error)throw error
}
