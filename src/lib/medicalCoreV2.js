import {supabase} from './supabaseClient'

async function rpc(name,args={}){
  const {data,error}=await supabase.rpc(name,args)
  if(error)throw error
  return data
}

export const med2Catalog=()=>rpc('bf_med2_catalog')
export const med2Project=projectId=>rpc('bf_med2_project_get',{p_project:projectId})
export const med2SaveOrganization=(name)=>rpc('bf_med2_save_organization',{p_name:name})
export const med2SaveProject=(v)=>rpc('bf_med2_save_project',{
  p_id:v.id||null,
  p_owner:v.owner_org_id,
  p_maintenance:v.maintenance_org_id,
  p_consultant:v.consultant_org_id||null,
  p_name:v.name,
  p_start:v.start_date||null,
  p_end:v.end_date||null
})
export const med2SaveSite=(v)=>rpc('bf_med2_save_site',{
  p_id:v.id||null,
  p_project:v.project_id,
  p_name:v.name,
  p_city:v.city||null,
  p_address:v.address||null,
  p_lat:v.latitude?Number(v.latitude):null,
  p_lng:v.longitude?Number(v.longitude):null
})
export const med2SaveLocation=(v)=>rpc('bf_med2_save_location',{
  p_kind:v.kind,
  p_id:v.id||null,
  p_project:v.project_id,
  p_site:v.site_id,
  p_parent:v.parent_id||null,
  p_name:v.name,
  p_code:v.code||null,
  p_level_no:v.level_no===''||v.level_no==null?null:Number(v.level_no)
})
export const med2SaveTeam=(v)=>rpc('bf_med2_save_team_member',{
  p_id:v.id||null,
  p_project:v.project_id,
  p_site:v.site_id||null,
  p_user:v.user_id,
  p_role:v.role_id
})
