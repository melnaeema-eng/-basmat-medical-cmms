const normalized=value=>String(value??'').trim().toLowerCase()

export function medicalProcedureMatchesAsset(procedure,asset){
  if(!procedure||!asset||procedure.status!=='approved')return false
  if(!asset.organization_id||procedure.organization_id!==asset.organization_id)return false
  if(procedure.category_id&&procedure.category_id!==asset.category_id)return false
  const manufacturer=normalized(procedure.manufacturer)
  if(manufacturer&&manufacturer!==normalized(asset.manufacturer_name||asset.manufacturer))return false
  const model=normalized(procedure.model)
  if(model&&model!==normalized(asset.exact_model||asset.resolved_model||asset.model))return false
  return true
}
