import {supabase} from './supabaseClient'
export async function loadEnterpriseStructure(orgId){
 const {data,error}=await supabase.rpc('bf35_structure',{p_org:orgId})
 if(error)throw error
 return data
}
export async function seedServiceLines(orgId){
 const {error}=await supabase.rpc('bf35_seed_service_lines',{p_org:orgId})
 if(error)throw error
}
export async function createProject(v){
 const {data,error}=await supabase.rpc('bf36_create_project_auto',{
  p_org:v.organization_id,p_client:v.client_id,p_contract:v.contract_id||null,
  p_name:v.name,p_start:v.start_date||null,p_end:v.end_date||null
 })
 if(error)throw error
 return data
}
export async function linkProjectSite(projectId,siteId){
 const {error}=await supabase.rpc('bf35_link_site',{p_project:projectId,p_site:siteId})
 if(error)throw error
}
export async function createTeam(v){
 const {data,error}=await supabase.rpc('bf36_create_team_auto',{
  p_project:v.project_id,p_service_line:v.service_line_id||null,p_site:v.site_id||null,
  p_name:v.name,p_discipline:v.discipline_code||null,p_shift:v.shift_code||null
 })
 if(error)throw error
 return data
}
export async function addTeamMember(v){
 const {error}=await supabase.rpc('bf35_add_team_member',{
  p_team:v.team_id,p_user:v.user_id,p_role:v.role_id||null,p_member_type:v.member_type||'worker',
  p_is_lead:!!v.is_lead,p_from:v.valid_from||null,p_until:v.valid_until||null
 })
 if(error)throw error
}
export async function loadStaffDirectory(){
 const {data,error}=await supabase.rpc('bf4_staff_directory')
 if(error)throw error
 return data||[]
}
