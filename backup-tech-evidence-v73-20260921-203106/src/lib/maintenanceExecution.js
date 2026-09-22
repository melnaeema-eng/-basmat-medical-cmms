import {supabase} from './supabaseClient'

export async function loadMyExecutionPackages(){
 const {data,error}=await supabase.rpc('bf_my_execution_packages')
 if(error)throw error
 return data||[]
}

export async function loadExecutionResults(packageId){
 const {data,error}=await supabase
  .from('bf_maintenance_execution_results')
  .select('*')
  .eq('package_id',packageId)
  .order('step_seq')
 if(error)throw error
 return data||[]
}

export async function startExecutionPackage(id){
 const {error}=await supabase.rpc('bf_start_execution_package',{p_package:id})
 if(error)throw error
}

export async function submitExecutionStep(packageId,step){
 const {data,error}=await supabase.rpc('bf_submit_execution_step',{
  p_package:packageId,
  p_step_seq:Number(step.seq),
  p_result_text:step.result_text||null,
  p_reading_value:step.reading_value===''||step.reading_value==null?null:Number(step.reading_value),
  p_pass_fail:step.pass_fail||null,
  p_photo_url:step.photo_url||null,
  p_notes:step.notes||null
 })
 if(error)throw error
 return data
}

export async function completeExecutionPackage(id,note=''){
 const {error}=await supabase.rpc('bf_complete_execution_package',{
  p_package:id,p_note:note||null
 })
 if(error)throw error
}
