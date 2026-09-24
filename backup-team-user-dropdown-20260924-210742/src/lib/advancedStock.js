import {supabase} from './supabaseClient'
export async function stockAction(command,id,payload={},key){
 const {data,error}=await supabase.rpc('bf8_action',{
  p_action:command,p_request:id||null,p_data:payload,p_key:key||crypto.randomUUID()
 })
 if(error)throw error
 return data
}
export async function readRows(table,columns='*',filters=[]){
 const out=[]
 for(let start=0;start<100000;start+=500){
  let q=supabase.from(table).select(columns).range(start,start+499)
  for(const [key,value] of filters)if(value!==null&&value!==undefined)q=q.eq(key,value)
  const {data,error}=await q
  if(error)throw error
  out.push(...(data||[]))
  if((data||[]).length<500)return out
 }
 throw Error('Dataset limit reached; narrow the scope.')
}
export async function loadAdvanced(){
 const defs=[
 ['requests','bf8_material_requests'],['lines','bf8_material_lines'],
 ['allocations','bf8_allocations'],['events','bf8_material_events'],
 ['lots','bf7_stock_lots','id,organization_id,part_id,owner_client_id,lot_code,serial_number,expires_on,warehouse_id,bin_id,quantity,reserved'],
 ['parts','bf_inv_parts','id,organization_id,sku,name_ar,name_en,unit,status'],
 ['warehouses','bf_inv_warehouses','id,organization_id,name_ar,name_en,status'],
 ['bins','bf_inv_bins','id,organization_id,warehouse_id,code'],
 ['organizations','bf_organizations','id,name,status'],
 ['clients','bf_clients','id,organization_id,name,status'],
 ['assignments','bf_work_order_assignments','work_order_id,user_id'],
 ['workOrders','bf_work_orders','id,organization_id,client_id,site_id,work_order_number,title,status']
 ]
 return Object.fromEntries(await Promise.all(defs.map(async([key,table,columns])=>[key,await readRows(table,columns||'*')])))
}
export async function loadCosts(org,workOrder){
 const {data,error}=await supabase.rpc('bf8_costs',{p_org:org,p_work_order:workOrder||null})
 if(error)throw error
 return data||[]
}
export const qty=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:3})
export const available=lot=>Number(lot.quantity)-Number(lot.reserved)
export const unissued=line=>Number(line.quantity)-Number(line.reserved_qty)-Number(line.issued_qty)
export const awaitingReceipt=a=>Number(a.issued_qty)-Number(a.received_qty)-Number(a.returned_unreceived_qty)
export const returnable=a=>Number(a.received_qty)-Number(a.consumed_qty)-Number(a.returned_received_qty)
