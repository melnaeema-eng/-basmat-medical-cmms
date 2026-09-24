import {supabase} from './supabaseClient'
export const frequencies=['daily','weekly','monthly','quarterly','semiannual','annual']
export const dateOnly=d=>d?new Date(d).toLocaleDateString():'—'
export async function ppmAction(kind,id,command,payload={}){
 const {data,error}=await supabase.rpc('bf5_action',{p_kind:kind,p_id:id||null,p_action:command,p_data:payload})
 if(error)throw error
 return data
}
export async function ppmRows(table,columns='*',filters=[]){
 const rows=[]
 for(let start=0;start<100000;start+=500){
  let q=supabase.from(table).select(columns).range(start,start+499)
  for(const [key,value] of filters)if(value!==''&&value!=null)q=q.eq(key,value)
  const {data,error}=await q
  if(error)throw error
  rows.push(...(data||[]))
  if((data||[]).length<500)return rows
 }
 throw Error('Dataset limit reached. Use a narrower filter.')
}
export async function loadPPM(){
 const defs=[
  ['procedures','bf_ppm_procedures'],['steps','bf_ppm_steps'],['plans','bf_ppm_plans'],['jobs','bf_ppm_jobs'],['results','bf_ppm_results'],['followups','bf_ppm_followups'],
  ['organizations','bf_organizations','id,name,code,status'],
  ['clients','bf_clients','id,organization_id,name,code,status'],
  ['sites','bf_sites','id,organization_id,client_id,contract_id,name,code,status'],
  ['contracts','bf_contracts','id,organization_id,client_id,contract_number,status'],
  ['assets','bf_assets','id,organization_id,client_id,site_id,category_id,asset_tag,name_ar,name_en,manufacturer,model,status'],
  ['categories','bf_asset_categories','id,organization_id,name_ar,name_en,code,status']
 ]
 const entries=await Promise.all(defs.map(async([key,table,columns])=>[key,await ppmRows(table,columns||'*')]))
 return Object.fromEntries(entries)
}
export async function loadPPMDirectory(){
 const {data,error}=await supabase.rpc('bf5_staff_directory')
 if(error)throw error
 return data||[]
}
export async function loadPPMHistory(kind,id){
 const {data,error}=await supabase.from('bf_ppm_events').select('id,action,actor_id,details,created_at').eq('entity_type',kind).eq('entity_id',id).order('id')
 if(error)throw error
 return data||[]
}
export {recurrenceDates} from './ppmCore'
