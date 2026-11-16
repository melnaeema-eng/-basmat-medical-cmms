const live=o=>o&&o.is_active!==false&&!['inactive','archived','disabled'].includes(o.status)
export const companyAdministrationPaths=['/maintenance-companies','/organizations','/facility-reference-library','/medical-knowledge-library','/medical-smart-onboarding','/medical-tenant-admin','/medical-service-library']
export const companyAdminPermission='platform.company-workspace'
export function bindHomeCompany(payload={},canonical={}){
 const organizations=(payload.organizations||[]).filter(live).map(o=>({...o,id:o.organization_id||o.id,organization_id:o.organization_id||o.id})).filter(o=>o.id)
 const requested=canonical.home_organization_id||canonical.home_organization?.organization_id||canonical.home_organization?.id||payload.home_organization_id||payload.home_organization?.organization_id||payload.home_organization?.id
 const home=organizations.find(o=>o.id===requested)||(organizations.length===1?organizations[0]:null)
 return {...payload,organizations,home_organization_id:home?.id||null,home_organization:home||null}
}
export function companyWorkspace(access={},profile={}){
 const normalized=bindHomeCompany(access)
 return {isSuperAdmin:profile?.is_super_admin===true||access?.super_admin===true||access?.is_super_admin===true,companyId:normalized.home_organization_id,company:normalized.home_organization}
}
export function companySelectionChange(scope,value,disabled=false){
 if(scope.isSuperAdmin||!scope.companyId||value===scope.companyId)return null
 // Never reassign an existing immutable record to another company.
 if(disabled&&value)return null
 return scope.companyId
}
export function isCompanyAdministrationPath(path){return companyAdministrationPaths.some(p=>path===p||path.startsWith(p+'/'))}

export function syncCompanyControl(scope,control,enabled=true){
 if(!enabled||!control?.onChange)return false
 const next=companySelectionChange(scope,control.value,control.disabled)
 if(!next)return false
 control.onChange(control.native?{target:{value:next},currentTarget:{value:next}}:next)
 return true
}
