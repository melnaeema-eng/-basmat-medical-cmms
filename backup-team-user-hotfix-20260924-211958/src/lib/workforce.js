import {supabase} from './supabaseClient'

export async function loadWorkforce(f={}){
 const {data,error}=await supabase.rpc('bf20_board',{
  p_org:f.organization_id||null,
  p_from:f.from?new Date(f.from+'T00:00:00').toISOString():null,
  p_to:f.to?new Date(f.to+'T23:59:59.999').toISOString():null,
  p_limit:f.limit||500
 })
 if(error)throw error
 return data
}

export async function scheduleWork(v){
 const {data,error}=await supabase.rpc('bf20_schedule',{
  p_task_type:v.task_type,
  p_task_id:v.task_id,
  p_technician:v.technician_id,
  p_start:new Date(v.scheduled_start).toISOString(),
  p_end:new Date(v.scheduled_end).toISOString(),
  p_notes:v.notes||'',
  p_sync_assignment:true
 })
 if(error)throw error
 return data
}

export async function rescheduleWork(id,start,end,notes=null){
 const {error}=await supabase.rpc('bf20_reschedule',{
  p_slot:id,p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_notes:notes
 })
 if(error)throw error
}

export async function cancelWork(id,reason){
 const {error}=await supabase.rpc('bf20_cancel',{p_slot:id,p_reason:reason})
 if(error)throw error
}

export async function completeWork(id){
 const {error}=await supabase.rpc('bf20_complete',{p_slot:id})
 if(error)throw error
}
