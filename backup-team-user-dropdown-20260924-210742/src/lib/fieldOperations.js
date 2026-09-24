import {supabase} from './supabaseClient'
export async function fieldAction(command,wo,id=null,payload={}){
 const {data,error}=await supabase.rpc('bf9_action',{p_action:command,p_wo:wo,p_id:id,p_data:payload})
 if(error)throw error
 return data
}
export async function fieldRows(table,wo,columns='*'){
 const out=[]
 for(let start=0;start<100000;start+=500){
  const {data,error}=await supabase.from(table).select(columns).eq('work_order_id',wo).range(start,start+499)
  if(error)throw error
  out.push(...(data||[]))
  if((data||[]).length<500)return out
 }
 throw Error('Field history limit reached')
}
export async function loadField(wo){
 const visits=await fieldRows('bf9_visits',wo)
 const ids=visits.map(v=>v.id)
 let labor=[]
 if(ids.length){
  for(let i=0;i<ids.length;i+=100){
   const {data,error}=await supabase.from('bf9_labor').select('*').in('visit_id',ids.slice(i,i+100))
   if(error)throw error
   labor.push(...(data||[]))
  }
 }
 const [evidence,events,requirements,materials]=await Promise.all([
  fieldRows('bf9_evidence',wo),
  fieldRows('bf9_events',wo),
  supabase.from('bf9_requirements').select('*').eq('work_order_id',wo).maybeSingle().then(({data,error})=>{if(error)throw error;return data}),
  supabase.rpc('bf9_material_summary',{p_wo:wo}).then(({data,error})=>{if(error)throw error;return data||[]})
 ])
 return {visits,labor,evidence,events,requirements,materials}
}
export async function uploadEvidence(wo,visit,file,caption=''){
 const allowed=['image/jpeg','image/png','image/webp','application/pdf']
 if(!allowed.includes(file.type)||file.size<1||file.size>10485760)throw Error('Select a supported file of up to 10 MB')
 const id=await fieldAction('register_evidence',wo,null,{visit_id:visit,file_name:file.name,mime_type:file.type,file_size:file.size,caption})
 const {data:ticket,error:ticketError}=await supabase.rpc('bf9_evidence_ticket',{p_id:id,p_upload:true})
 if(ticketError)throw ticketError
 const {error}=await supabase.storage.from('bf9-evidence').upload(ticket,file,{upsert:false,contentType:file.type})
 if(error)throw error
 await fieldAction('confirm_evidence',wo,id)
 return id
}
export async function openEvidence(id){
 const {data:path,error}=await supabase.rpc('bf9_evidence_ticket',{p_id:id,p_upload:false})
 if(error)throw error
 const {data,error:downloadError}=await supabase.storage.from('bf9-evidence').createSignedUrl(path,60)
 if(downloadError)throw downloadError
 return data.signedUrl
}
export async function enableField(wo,required=true){
 const {error}=await supabase.rpc('bf9_enable_field',{p_wo:wo,p_require_evidence:required})
 if(error)throw error
}
export function localDateTime(value){
 if(!value)return ''
 const d=new Date(value)
 if(Number.isNaN(d.getTime()))return ''
 return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19)
}
export const minutes=(start,end)=>Math.round((new Date(end)-new Date(start))/60000)
