import {supabase} from './supabaseClient'

export async function loadSupplierPerformance(f={}){
 const {data,error}=await supabase.rpc('bf19_dashboard',{
  p_org:f.organization_id||null,
  p_from:f.from||null,
  p_to:f.to||null,
  p_limit:f.limit||200
 })
 if(error)throw error
 return data
}

export async function evaluateSupplier(v){
 const {data,error}=await supabase.rpc('bf19_evaluate',{
  p_supplier:v.supplier_id,
  p_quality:Number(v.quality_score),
  p_delivery:Number(v.delivery_score),
  p_service:Number(v.service_score),
  p_commercial:Number(v.commercial_score),
  p_notes:v.notes||'',
  p_date:v.evaluation_date||null
 })
 if(error)throw error
 return data
}
