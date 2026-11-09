// Resolve saved device location through its actual parent records. Never invent labels.
export async function loadPassportLocation(asset,readOne){
 const scoped=async(table,id)=>{
  const row=await readOne(table,id)
  if(!row)return null
  if(row.organization_id&&row.organization_id!==asset.organization_id)return null
  if(row.site_id&&asset.site_id&&row.site_id!==asset.site_id)return null
  return row
 }
 const room=await scoped('bf_rooms',asset.room_id)
 const zone=await scoped('bf_zones',room?.zone_id||asset.zone_id)
 const floor=await scoped('bf_floors',zone?.floor_id||room?.floor_id||asset.floor_id)
 const building=await scoped('bf_buildings',floor?.building_id||zone?.building_id||room?.building_id||asset.building_id)
 const site=await scoped('bf_sites',asset.site_id||building?.site_id)
 return {site,building,floor,zone,room}
}
export function passportLocationFields(location,lang='ar'){
 const ar=lang==='ar'
 return [['site',ar?'المستشفى / الموقع':'Hospital / site'],['building',ar?'المبنى':'Building'],['floor',ar?'الطابق':'Floor'],['zone',ar?'الجناح / الجهة / المنطقة':'Wing / zone'],['room',ar?'الغرفة':'Room']].map(([key,label])=>{
  const row=location?.[key]
  const value=(ar?row?.name_ar:row?.name_en)||row?.name||row?.code||''
  return {key,label,value,missing:!value}
 })
}
