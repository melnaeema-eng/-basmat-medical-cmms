export const medicalSearchText=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ـ/g,'').toLowerCase().trim()

export function findMedicalLibraryModels(master,query=''){
 const needle=medicalSearchText(query)
 const active=row=>row&&!['inactive','archived'].includes(row.status)
 const types=new Map((master?.types||[]).filter(active).map(x=>[String(x.id),x]))
 const makers=new Map((master?.manufacturers||[]).filter(active).map(x=>[String(x.id),x]))
 return (master?.options||[]).filter(active).flatMap(option=>{
  const type=types.get(String(option.asset_type_id)),maker=makers.get(String(option.manufacturer_id))
  if(!type||!maker)return []
  const text=medicalSearchText([type.code,type.name_ar,type.name_en,maker.code,maker.name,maker.short_name,option.model_family].filter(Boolean).join(' '))
  return !needle||text.includes(needle)?[{option,type,maker}]:[]
 })
}
