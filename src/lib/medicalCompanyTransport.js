import {medicalOrganizationTables} from './medicalCompanyConfig.js'

// Database policies remain the authorization boundary. The transport narrows
// operational reads and writes to the company's current workspace.
const shared=new Set(['bf_asset_categories','bf_ppm_procedures','bf37_task_templates','bf_acl_roles','bf_roles'])
const bootstrap=new Set(['bf_acl_my_context','bf3_my_access','bf_can'])
const platformRpcs=new Set([
 'bf_fac_company_workspace_directory','bf_med_save_company_workspace','bf_med_set_company_workspace_status',
 'bf61_users_directory','bf_company_project_directory','bf_company_admin_access','bf62_project_access_catalog',
 'bf3_assign_role','bf61_remove_user_role','bf_company_assign_project','bf_company_set_project_active',
 'bf36_organization_directory','bf36_create_organization','bf36_update_organization'
])
const scopeKeys=new Set(['p_org','p_organization','p_organization_id','organization_id'])
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const denied=()=>new Response(JSON.stringify({code:'MEDICAL_COMPANY_SCOPE',message:'Select your company workspace / افتح مساحة الشركة أولًا'}),{status:403,headers:{'Content-Type':'application/json'}})
let workspace={companyId:null,isPlatformAdmin:false}
export function setMedicalWorkspace(next){workspace=next}
const acceptsCompany=(value,companyId)=>value==null||value===''||value===companyId

function validRpcScope(value,companyId){
 if(!value||typeof value!=='object')return true
 return Object.entries(value).every(([key,item])=>
  scopeKeys.has(key)?acceptsCompany(item,companyId):validRpcScope(item,companyId))
}

export function scopeMedicalResult(value,companyId,key=''){
 if(Array.isArray(value))return value.filter(row=>{
  if(!row||typeof row!=='object')return true
  if(key==='organizations')return (row.organization_id||row.id)===companyId
  return acceptsCompany(row.organization_id,companyId)
 }).map(row=>scopeMedicalResult(row,companyId))
 if(!value||typeof value!=='object')return value
 if(!acceptsCompany(value.organization_id,companyId))return null
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,scopeMedicalResult(v,companyId,k)]))
}

export function createMedicalCompanyFetch(baseFetch,apiUrl,getWorkspace=()=>workspace){
 const apiOrigin=new URL(apiUrl).origin
 return async(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
  if(url.origin!==apiOrigin||!url.pathname.startsWith('/rest/v1/'))return baseFetch(input,init)
  const resource=decodeURIComponent(url.pathname.slice('/rest/v1/'.length))
  const rpc=resource.startsWith('rpc/')?resource.slice(4):''
  const method=(init.method||(typeof input==='object'?input.method:null)||'GET').toUpperCase()
  const {companyId,isPlatformAdmin}=getWorkspace()
  if(bootstrap.has(rpc)||(isPlatformAdmin&&platformRpcs.has(rpc)))return baseFetch(input,init)
  if(isPlatformAdmin&&resource==='bf_organizations'&&['GET','HEAD'].includes(method))return baseFetch(input,init)
  const scoped=resource==='bf_organizations'||medicalOrganizationTables.has(resource)
  const canScope=uuid.test(companyId||'')
  // Reference libraries may call unscoped RPCs without a workspace. Operational
  // routes do not render until the workspace is selected and bound.
  if(scoped&&!canScope)return denied()
  let next={...init}
  if((scoped||rpc)&&['POST','PATCH'].includes(method)&&next.body===undefined&&input instanceof Request)next.body=await input.clone().text()
  if(scoped){
   if(resource==='bf_organizations'&&['POST','DELETE'].includes(method))return denied()
   const column=resource==='bf_organizations'?'id':'organization_id'
   const clause=shared.has(resource)?`or(${column}.is.null,${column}.eq.${companyId})`:`${column}.eq.${companyId}`
   const prior=url.searchParams.getAll('and').map(and=>'and'+and)
   url.searchParams.set('and','('+[...prior,clause].join(',')+')')
   if(['POST','PATCH'].includes(method)&&typeof next.body==='string'){
    let body
    try{body=JSON.parse(next.body)}catch{return denied()}
    const rows=Array.isArray(body)?body:[body]
    if(rows.some(row=>!row||typeof row!=='object'||!acceptsCompany(row[column],companyId)))return denied()
    if(method==='POST'&&!shared.has(resource))for(const row of rows)row[column]=companyId
    next.body=JSON.stringify(body)
   }
  }
  if(rpc&&typeof next.body==='string'){
   let body
   try{body=JSON.parse(next.body)}catch{return denied()}
   if(!validRpcScope(body,companyId))return denied()
   for(const key of ['p_org','p_organization','p_organization_id'])if(key in body){
    if(!canScope)return denied()
    body[key]=companyId
   }
   next.body=JSON.stringify(body)
  }
  const requestInput=input instanceof Request?new Request(url,input):url.toString()
  const response=await baseFetch(requestInput,next)
  if(!rpc||!canScope||!response.ok||!response.headers.get('content-type')?.includes('json'))return response
  const result=scopeMedicalResult(await response.json(),companyId)
  const headers=new Headers(response.headers);headers.delete('content-length')
  return new Response(JSON.stringify(result),{status:response.status,statusText:response.statusText,headers})
 }
}
