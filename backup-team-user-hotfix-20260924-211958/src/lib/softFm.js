import {supabase} from './supabaseClient'
export async function loadSoftFmDashboard(orgId,date){
 const {data,error}=await supabase.rpc('bf37_dashboard',{p_org:orgId,p_date:date})
 if(error)throw error
 return data||{summary:{},tasks:[]}
}
export async function seedSoftFmTemplates(orgId){
 const {error}=await supabase.rpc('bf37_seed_templates',{p_org:orgId})
 if(error)throw error
}
export async function createSoftFmTask(v){
 const {data,error}=await supabase.rpc('bf37_create_task',{
  p_org:v.organization_id,p_client:v.client_id,p_project:v.project_id||null,p_site:v.site_id||null,
  p_team:v.team_id||null,p_template:v.template_id||null,p_service_type:v.service_type,
  p_title:v.title,p_description:v.description||null,p_priority:v.priority||'normal',
  p_scheduled:v.scheduled_date,p_due:v.due_at||null,p_assigned_user:v.assigned_user_id||null
 })
 if(error)throw error
 return data
}
export async function softFmAction(taskId,action,note=''){
 const {error}=await supabase.rpc('bf37_action',{p_task:taskId,p_action:action,p_note:note||null})
 if(error)throw error
}
