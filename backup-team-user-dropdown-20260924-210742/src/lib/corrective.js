import {supabase} from './supabaseClient'
export const priorities=['P1','P2','P3','P4']
export const statuses=['draft','assigned','accepted','in_progress','on_hold','completed','approved','closed','cancelled']
export async function page(table,columns='*',filters=[]){
 const rows=[]
 for(let start=0;start<100000;start+=500){
  let q=supabase.from(table).select(columns).order(table==='bf_service_requests'?'reported_at':'created_at',{ascending:false}).range(start,start+499)
  for(const [key,value] of filters)if(value)q=q.eq(key,value)
  const {data,error}=await q
  if(error)throw error
  rows.push(...data)
  if(data.length<500)return rows
 }
 throw Error('Too many records. Apply a narrower filter.')
}
export async function action(kind,id,command,payload={}){
 const {data,error}=await supabase.rpc('bf4_action',{p_kind:kind,p_id:id||null,p_action:command,p_data:payload})
 if(error)throw error
 return data
}
export async function loadCorrective(){
 const [requests,workOrders,sites,clients,organizations,assets,contracts,assignments,staff]=await Promise.all([
  page('bf_service_requests'),page('bf_work_orders'),
  page('bf_sites','id,organization_id,client_id,contract_id,name,code,status'),
  page('bf_clients','id,organization_id,name,code,status'),
  page('bf_organizations','id,name,code,status'),
  page('bf_assets','id,organization_id,client_id,site_id,asset_tag,name_ar,name_en,status'),
  page('bf_contracts','id,organization_id,client_id,contract_number,status'),
  supabase.from('bf_work_order_assignments').select('work_order_id,user_id').then(({data,error})=>{if(error)throw error;return data||[]}),
  supabase.rpc('bf4_staff_directory').then(({data,error})=>{if(error)throw error;return data||[]})
 ])
 return {requests,workOrders,sites,clients,organizations,assets,contracts,assignments,staff}
}
export async function loadHistory(kind,id){
 const column=kind==='request'?'request_id':'work_order_id'
 const {data,error}=await supabase.from('bf_corrective_events').select('id,actor_id,action,from_status,to_status,details,created_at').eq(column,id).order('id',{ascending:true})
 if(error)throw error
 return data||[]
}
