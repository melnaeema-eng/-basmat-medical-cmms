import {supabase} from './supabaseClient'
export async function searchMedicalDevices(term=''){
  let q=supabase.from('bf_med_assets').select('id,organization_id,master_type_id,manufacturer_id,asset_tag,serial_number,model,exact_model,department,site_name,location_text,criticality,operational_status,lifecycle_status,warranty_end_date,next_pm_date,next_calibration_date,supplier_name').order('created_at',{ascending:false}).limit(100)
  const s=(term||'').trim(); if(s)q=q.or(`serial_number.ilike.%${s}%,asset_tag.ilike.%${s}%,model.ilike.%${s}%,exact_model.ilike.%${s}%`)
  const {data,error}=await q; if(error)throw error; return data||[]
}
export async function loadMedicalDeviceTraceability(assetId){
  const {data:asset,error:assetError}=await supabase.from('bf_med_assets').select('*').eq('id',assetId).single(); if(assetError)throw assetError
  const [{data:type},{data:mfr},{data:passport},{data:links,error:linksError}]=await Promise.all([
    asset.master_type_id?supabase.from('bf_med_master_types').select('id,code,name_ar,name_en,icon_text').eq('id',asset.master_type_id).maybeSingle():Promise.resolve({data:null}),
    asset.manufacturer_id?supabase.from('bf_med_manufacturers').select('id,name,code').eq('id',asset.manufacturer_id).maybeSingle():Promise.resolve({data:null}),
    supabase.from('bf_asset_passports').select('id,passport_code,qr_token,status,created_at').eq('asset_domain','medical').eq('asset_id',assetId).maybeSingle(),
    supabase.from('bf_med_asset_commercial_links').select('*').eq('asset_id',assetId).order('transaction_date',{ascending:false}).order('created_at',{ascending:false})
  ]); if(linksError)throw linksError
  let snapshot=null; if(passport?.passport_code){const {data,error}=await supabase.rpc('bf_asset_passport_snapshot',{p_code:passport.passport_code}); if(!error)snapshot=data}
  const {data:ppm}=await supabase.from('bf_med_ppm_plans').select('*').eq('asset_id',assetId).order('created_at',{ascending:false})
  return {asset,type:type||null,manufacturer:mfr||null,passport:passport||null,snapshot:snapshot||null,ppm:ppm||[],commercialLinks:links||[]}
}
export async function addCommercialLink(v){
  const {data,error}=await supabase.rpc('bf_med_add_commercial_link',{p_asset:v.asset_id,p_link_type:v.link_type,p_reference_number:v.reference_number||null,p_source_table:v.source_table||null,p_source_id:v.source_id||null,p_supplier_name:v.supplier_name||null,p_amount:v.amount===''||v.amount==null?null:Number(v.amount),p_currency:v.currency||'SAR',p_transaction_date:v.transaction_date||null,p_notes:v.notes||null}); if(error)throw error; return data
}
