import {supabase} from './supabaseClient'

const BUCKET='maintenance-evidence'

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

export async function loadExecutionAttachments(packageId){
 const {data,error}=await supabase
  .from('bf_maintenance_execution_attachments')
  .select('*')
  .eq('package_id',packageId)
  .order('uploaded_at')
 if(error)throw error
 return data||[]
}

export async function uploadExecutionEvidence(pkg,stepSeq,file){
 const safe=(file.name||'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-160)
 const key=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`)
 const objectPath=`${pkg.organization_id}/${pkg.id}/${stepSeq}/${key}-${safe}`

 const {error:uploadError}=await supabase.storage
  .from(BUCKET)
  .upload(objectPath,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined})
 if(uploadError)throw uploadError

 const {data,error}=await supabase.rpc('bf_register_execution_attachment',{
  p_package:pkg.id,
  p_step_seq:Number(stepSeq),
  p_object_path:objectPath,
  p_file_name:file.name||safe,
  p_mime_type:file.type||null,
  p_size_bytes:file.size||null
 })
 if(error){
  await supabase.storage.from(BUCKET).remove([objectPath]).catch(()=>{})
  throw error
 }
 return data
}

export async function removeExecutionEvidence(row){
 const {data:path,error}=await supabase.rpc('bf_delete_execution_attachment',{p_attachment:row.id})
 if(error)throw error
 const {error:storageError}=await supabase.storage.from(BUCKET).remove([path||row.object_path])
 if(storageError)throw storageError
}

export async function openExecutionEvidence(row){
 const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(row.object_path,300)
 if(error)throw error
 if(!data?.signedUrl)throw Error('Unable to create secure file link')
 window.open(data.signedUrl,'_blank','noopener,noreferrer')
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
  p_photo_url:null,
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
