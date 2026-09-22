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

export async function loadHealthcareOwners(){
 const {data,error}=await supabase
  .from('bf_med_healthcare_owners')
  .select('id,name_ar,name_en,owner_type,ownership_sector,region,city,is_manual,status')
  .eq('status','active')
  .order('region')
  .order('city')
  .order('name_en')
 if(error)throw error
 return data||[]
}

export async function createManualHealthcareOwner(v){
 const payload={
  name_ar:v.name_ar?.trim()||v.name_en?.trim()||'',
  name_en:v.name_en?.trim()||v.name_ar?.trim()||'',
  owner_type:v.owner_type||'company',
  ownership_sector:v.ownership_sector||'private',
  region:v.region?.trim()||null,
  city:v.city?.trim()||null,
  source:'Manual',
  source_url:null,
  is_manual:true,
  status:'active'
 }
 const {data,error}=await supabase
  .from('bf_med_healthcare_owners')
  .insert(payload)
  .select('id,name_ar,name_en,owner_type,ownership_sector,region,city,is_manual,status')
  .single()
 if(error)throw error
 return data
}

function projectIdFromRpc(data){
 if(!data)return ''
 if(typeof data==='string')return data
 if(Array.isArray(data))return data[0]?.id||data[0]?.project_id||''
 return data.id||data.project_id||''
}

export async function resolveCreatedProjectId(rpcData,v){
 const direct=projectIdFromRpc(rpcData)
 if(direct)return direct

 let q=supabase
  .from('bf35_projects')
  .select('id,name,organization_id,client_id,contract_id,start_date,end_date,created_at')
  .eq('organization_id',v.organization_id)
  .eq('client_id',v.client_id)
  .eq('name',v.name)
  .order('created_at',{ascending:false})
  .limit(1)

 if(v.contract_id)q=q.eq('contract_id',v.contract_id)
 else q=q.is('contract_id',null)

 const {data,error}=await q
 if(error)throw error
 if(!data?.[0]?.id)throw Error('Project created but project ID could not be resolved.')
 return data[0].id
}

export async function linkProjectOwner(projectId,ownerId){
 const {error}=await supabase
  .from('bf_med_project_owners')
  .upsert({project_id:projectId,owner_id:ownerId},{onConflict:'project_id'})
 if(error)throw error
}
