import {supabase} from './supabaseClient'
export async function procurementAction(kind,id,command,payload={}){
 const {data,error}=await supabase.rpc('bf7_action',{p_kind:kind,p_id:id||null,p_action:command,p_data:payload})
 if(error)throw error
 return data
}
export async function rows(table,columns='*'){
 const out=[]
 for(let start=0;start<100000;start+=500){
  const {data,error}=await supabase.from(table).select(columns).range(start,start+499)
  if(error)throw error
  out.push(...(data||[]))
  if((data||[]).length<500)return out
 }
 throw Error('Dataset limit reached')
}
export async function loadProcurement(){
 const defs=[
 ['suppliers','bf7_suppliers'],['requisitions','bf7_requisitions'],['requisitionLines','bf7_requisition_lines'],
 ['orders','bf7_purchase_orders'],['orderLines','bf7_po_lines'],['receipts','bf7_receipts'],
 ['stock','bf7_stock_lots'],['movements','bf7_stock_moves'],
 ['parts','bf_inv_parts','id,organization_id,sku,name_ar,name_en,unit,status'],
 ['warehouses','bf_inv_warehouses','id,organization_id,name_ar,name_en,status'],
 ['bins','bf_inv_bins','id,organization_id,warehouse_id,code'],
 ['organizations','bf_organizations','id,name,status'],
 ['clients','bf_clients','id,organization_id,name,status'],
 ['workOrders','bf_work_orders','id,organization_id,work_order_number,title,status']
 ]
 return Object.fromEntries(await Promise.all(defs.map(async([key,table,columns])=>[key,await rows(table,columns||'*')])))
}
export {amount,total,receiptRemaining} from './procurementCore'
