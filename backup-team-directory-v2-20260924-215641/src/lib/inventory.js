import {supabase} from './supabaseClient'
export async function inventoryAction(kind,id,command,payload={}){
 const {data,error}=await supabase.rpc('bf6_action',{p_kind:kind,p_id:id||null,p_action:command,p_data:payload})
 if(error)throw error
 return data
}
export async function inventoryRows(table,columns='*'){
 const rows=[]
 for(let start=0;start<100000;start+=500){
  const {data,error}=await supabase.from(table).select(columns).range(start,start+499)
  if(error)throw error
  rows.push(...(data||[]))
  if((data||[]).length<500)return rows
 }
 throw Error('Dataset limit reached. Apply a narrower scope.')
}
export async function loadInventory(){
 const defs=[
  ['parts','bf_inv_parts'],['warehouses','bf_inv_warehouses'],['bins','bf_inv_bins'],
  ['stock','bf_inv_stock'],['requests','bf_inv_requests'],['movements','bf_inv_movements'],
  ['organizations','bf_organizations','id,name,code,status'],
  ['clients','bf_clients','id,organization_id,name,code,status'],
  ['sites','bf_sites','id,organization_id,client_id,name,code,status'],
  ['workOrders','bf_work_orders','id,organization_id,client_id,site_id,work_order_number,title,status']
 ]
 const entries=await Promise.all(defs.map(async([key,table,columns])=>[key,await inventoryRows(table,columns||'*')]))
 return Object.fromEntries(entries)
}
export {quantity,available,stockTotals} from './inventoryCore'
