import {supabase} from './supabaseClient'

const unwrap = data => Array.isArray(data) ? (data[0] ?? null) : data

export async function loadProjectSetupCatalog(){
  const [orgs,clients,contracts,sites,roles] = await Promise.all([
    supabase.from('bf_organizations').select('id,name,name_ar,name_en,code,status').neq('status','archived').order('name'),
    supabase.from('bf_clients').select('id,organization_id,tenant_id,name,code,email,phone,status').neq('status','archived').order('name'),
    supabase.from('bf_contracts').select('id,organization_id,client_id,contract_number,contract_type,start_date,end_date,contract_value,status').neq('status','archived').order('contract_number'),
    supabase.from('bf_sites').select('id,organization_id,client_id,contract_id,name,code,city,address,status,latitude,longitude').neq('status','archived').order('name'),
    supabase.from('bf_roles').select('id,organization_id,name,code').order('name')
  ])
  for(const r of [orgs,clients,contracts,sites,roles]) if(r.error) throw r.error
  return {organizations:orgs.data||[],clients:clients.data||[],contracts:contracts.data||[],sites:sites.data||[],roles:roles.data||[]}
}

export async function loadProjectSetupUsers(orgId){
  if(!orgId)return []
  const {data,error}=await supabase.rpc('bf_med_ps_user_directory',{p_org:orgId})
  if(error) throw error
  return (data||[]).map(x=>x?.j||x)
}

export async function addProjectSetupReference(kind,payload){
  const {data,error}=await supabase.rpc('bf_med_ps_save_reference',{p_kind:kind,p_data:payload})
  if(error) throw error
  return unwrap(data)
}

export async function createSetupProject(v){
  const {data,error}=await supabase.rpc('bf_med_ps_create_project',{
    p_org:v.organization_id,p_client:v.client_id,p_contract:v.contract_id||null,
    p_name:v.name,p_start:v.start_date||null,p_end:v.end_date||null
  })
  if(error) throw error
  const x=unwrap(data)
  return typeof x==='string'?x:(x?.id||x?.project_id||x)
}

export async function linkSetupSite(projectId,siteId){
  if(!siteId)return
  const {error}=await supabase.rpc('bf35_link_site',{p_project:projectId,p_site:siteId})
  if(error)throw error
}

export async function assignSetupUser({user_id,organization_id,project_id,role_id,site_id}){
  const {error}=await supabase.rpc('bf_med_ps_assign_project_user',{
    p_user:user_id,
    p_org:organization_id,
    p_project:project_id,
    p_role:role_id,
    p_site:site_id||null
  })
  if(error)throw error
}
