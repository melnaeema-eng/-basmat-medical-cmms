import {supabase} from './supabaseClient'

export async function loadExistingMedicalMasters(organization_id){
  const [clientsRes,sitesRes,projectsRes]=await Promise.all([
    supabase.from('bf_clients')
      .select('id,organization_id,tenant_id,name,code,status')
      .eq('organization_id',organization_id)
      .eq('status','active')
      .order('name'),
    supabase.from('bf_sites')
      .select('id,organization_id,client_id,name,code,city,address,status')
      .eq('organization_id',organization_id)
      .eq('status','active')
      .order('name'),
    supabase.from('bf35_projects')
      .select('id,organization_id,client_id,contract_id,project_code,name,status')
      .eq('organization_id',organization_id)
      .neq('status','closed')
      .order('project_code')
  ])

  if(clientsRes.error)throw clientsRes.error
  if(sitesRes.error)throw sitesRes.error
  if(projectsRes.error)throw projectsRes.error

  return {
    clients:clientsRes.data||[],
    sites:sitesRes.data||[],
    projects:projectsRes.data||[]
  }
}

export async function linkExistingMedicalOwner(organization_id,client_id){
  const {error}=await supabase.rpc('bf_med_link_client',{
    p_org:organization_id,
    p_client:client_id
  })
  if(error)throw error
}

export async function createMedicalOwner(v){
  const {data,error}=await supabase.rpc('bf_med_create_client',{
    p_org:v.organization_id,
    p_name:v.name,
    p_code:v.code||null,
    p_email:v.email||null,
    p_phone:v.phone||null
  })
  if(error)throw error
  return data
}

export async function linkExistingMedicalProject(organization_id,client_id,project_id){
  const {error}=await supabase.rpc('bf_med_link_project',{
    p_org:organization_id,
    p_client:client_id,
    p_project:project_id
  })
  if(error)throw error
}

export async function createMedicalProject(v){
  const {data,error}=await supabase.rpc('bf_med_create_project',{
    p_org:v.organization_id,
    p_client:v.client_id,
    p_name:v.name,
    p_start:v.start_date||null,
    p_end:v.end_date||null,
    p_contract:v.contract_id||null
  })
  if(error)throw error
  return data
}

export async function linkExistingMedicalSite(v){
  const {error}=await supabase.rpc('bf_med_link_site',{
    p_org:v.organization_id,
    p_client:v.client_id,
    p_project:v.project_id||null,
    p_site:v.site_id
  })
  if(error)throw error
}

export async function createMedicalSite(v){
  const {data,error}=await supabase.rpc('bf_med_create_site',{
    p_org:v.organization_id,
    p_client:v.client_id,
    p_project:v.project_id||null,
    p_name:v.name,
    p_code:v.code||null,
    p_city:v.city||null,
    p_address:v.address||null
  })
  if(error)throw error
  return data
}
