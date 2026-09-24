import {supabase} from './supabaseClient'
export {levels,code,display,active,date,locationLabel} from './facilityCore'
export const PUBLIC_ASSET_COLUMNS='id,organization_id,client_id,site_id,building_id,floor_id,zone_id,room_id,category_id,parent_asset_id,asset_tag,name_ar,name_en,description,serial_number,manufacturer,model,capacity,unit,installation_date,commissioning_date,purchase_date,warranty_start,warranty_end,warranty_provider,expected_life_years,criticality,condition,operational_status,status,notes,created_by,updated_by,created_at,updated_at'
export const tables={buildings:'bf_buildings',floors:'bf_floors',zones:'bf_zones',rooms:'bf_rooms',categories:'bf_asset_categories',assets:'bf_assets'}
export async function loadAll(){
 const defs=[['organizations','bf_organizations'],['clients','bf_clients'],['contracts','bf_contracts'],['sites','bf_sites'],...Object.entries(tables)]
 const result=await Promise.all(defs.map(async([key,table])=>{
  const columns=table==='bf_assets'?PUBLIC_ASSET_COLUMNS:'*'
  const rows=[];const pageSize=500
  for(let start=0;start<100000;start+=pageSize){
   const {data,error}=await supabase.from(table).select(columns).order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+pageSize-1)
   if(error)throw error
   rows.push(...(data||[]))
   if((data||[]).length<pageSize)return [key,rows]
  }
  throw Error('Dataset exceeds the current 100,000-record client limit. Use server-side pagination.')
 }))
 return Object.fromEntries(result)
}
export async function save(table,row,id){
 if(table==='bf_assets'){
  const {data,error}=await supabase.rpc('bf3_save_asset',{p_id:id||null,p_payload:row})
  if(error)throw error
  return {id:data}
 }
 const query=id?supabase.from(table).update(row).eq('id',id):supabase.from(table).insert(row)
 const {data,error}=await query.select().single()
 if(error)throw error;return data
}
