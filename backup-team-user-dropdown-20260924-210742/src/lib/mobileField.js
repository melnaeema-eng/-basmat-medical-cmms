import {supabase} from './supabaseClient'

export async function loadMobileField(){
 const {data,error}=await supabase.rpc('bf31_workspace',{p_limit:100})
 if(error)throw error
 return data
}
export async function lookupAsset(code){
 const {data,error}=await supabase.rpc('bf31_asset_lookup',{p_code:code})
 if(error)throw error
 return data
}
export async function fieldAction(action,workOrderId,id=null,payload={}){
 const {data,error}=await supabase.rpc('bf9_action',{p_action:action,p_wo:workOrderId,p_id:id,p_data:payload})
 if(error)throw error
 return data
}
export async function uploadEvidence(workOrderId,visitId,file,caption=''){
 const evidenceId=await fieldAction('register_evidence',workOrderId,null,{
  visit_id:visitId,file_name:file.name,mime_type:file.type,file_size:file.size,caption
 })
 const {data:path,error:pathError}=await supabase.rpc('bf9_evidence_ticket',{p_id:evidenceId,p_upload:true})
 if(pathError)throw pathError
 const {error:uploadError}=await supabase.storage.from('bf9-evidence').upload(path,file,{contentType:file.type,upsert:false})
 if(uploadError)throw uploadError
 await fieldAction('confirm_evidence',workOrderId,evidenceId,{})
 return evidenceId
}
