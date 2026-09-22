import {supabase} from './supabaseClient'

export async function loadMasterAssetLibrary(){
 const defs=[
  ['types','bf_master_asset_types'],
  ['manufacturers','bf_master_manufacturers'],
  ['options','bf_master_asset_options'],
  ['templates','bf_master_ppm_templates'],
  ['steps','bf_master_ppm_steps'],
  ['organizations','bf_organizations']
 ]
 const out=await Promise.all(defs.map(async([key,table])=>{
  let q=supabase.from(table).select('*')
  if(!['bf_master_asset_options','bf_master_ppm_steps'].includes(table))q=q.order('created_at',{ascending:true})
  const {data,error}=await q
  if(error)throw error
  return [key,data||[]]
 }))
 return Object.fromEntries(out)
}

export async function loadMasterAssetCatalogReport(){
 const {data,error}=await supabase.from('bf_master_asset_catalog_report').select('*').order('system_code').order('name_en')
 if(error)throw error
 return data||[]
}

export async function adoptMasterTemplates(org,type,manufacturer=null){
 const {data,error}=await supabase.rpc('bf_master_adopt_templates',{
  p_org:org,p_asset_type:type,p_manufacturer:manufacturer||null
 })
 if(error)throw error
 return data
}
