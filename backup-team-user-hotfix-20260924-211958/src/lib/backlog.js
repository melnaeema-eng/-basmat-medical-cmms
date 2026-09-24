import {supabase} from './supabaseClient'

export async function loadBacklog(f={}){
 const {data,error}=await supabase.rpc('bf21_backlog',{
  p_org:f.organization_id||null,
  p_client:f.client_id||null,
  p_limit:f.limit||300
 })
 if(error)throw error
 return data
}

export async function setBacklogOverride(v){
 const {data,error}=await supabase.rpc('bf21_set_override',{
  p_task_type:v.task_type,
  p_task_id:v.task_id,
  p_score:Number(v.override_score),
  p_reason:v.reason,
  p_valid_until:v.valid_until?new Date(v.valid_until).toISOString():null
 })
 if(error)throw error
 return data
}

export async function clearBacklogOverride(taskType,taskId,reason){
 const {error}=await supabase.rpc('bf21_clear_override',{
  p_task_type:taskType,p_task_id:taskId,p_reason:reason
 })
 if(error)throw error
}
