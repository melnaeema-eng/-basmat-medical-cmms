import {MEDICAL_COMPANY_ID,medicalOrganizationTables} from './medicalCompanyConfig.js'

// Application scope is additional to the existing database RLS and permissions.
// Shared manufacturer/procedure dictionaries remain available to the library.
const shared=new Set(['bf_asset_categories','bf_ppm_procedures','bf37_task_templates','bf_acl_roles','bf_roles'])
const denied=()=>new Response(JSON.stringify({code:'MEDICAL_COMPANY_SCOPE',message:'This medical installation belongs to Basmat Alnawabigh only / الطبية مخصصة لشركة بصمة النوابغ فقط'}),{status:403,headers:{'Content-Type':'application/json'}})
function acceptsCompany(value){return value==null||value===''||value===MEDICAL_COMPANY_ID}
function validRpcScope(value){
 if(!value||typeof value!=='object')return true
 return Object.entries(value).every(([key,item])=>
  ['p_org','p_organization','p_organization_id','organization_id'].includes(key)
   ?acceptsCompany(item):validRpcScope(item))
}
export function scopeMedicalResult(value,key=''){
 if(Array.isArray(value))return value.filter(row=>{
  if(!row||typeof row!=='object')return true
  if(key==='organizations')return (row.organization_id||row.id)===MEDICAL_COMPANY_ID
  return acceptsCompany(row.organization_id)
 }).map(row=>scopeMedicalResult(row))
 if(!value||typeof value!=='object')return value
 if(!acceptsCompany(value.organization_id))return null
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,
  ['home_organization_id','active_organization_id'].includes(k)?MEDICAL_COMPANY_ID:scopeMedicalResult(v,k)]))
}
export function createMedicalCompanyFetch(baseFetch,apiUrl){
 const apiOrigin=new URL(apiUrl).origin
 return async(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
  if(url.origin!==apiOrigin||!url.pathname.startsWith('/rest/v1/'))return baseFetch(input,init)
  const resource=decodeURIComponent(url.pathname.slice('/rest/v1/'.length)),rpc=resource.startsWith('rpc/')
  const method=(init.method||(typeof input==='object'?input.method:null)||'GET').toUpperCase()
  const scoped=resource==='bf_organizations'||medicalOrganizationTables.has(resource)
  let next={...init}
  if((scoped||rpc)&&['POST','PATCH'].includes(method)&&next.body===undefined&&input instanceof Request)next.body=await input.clone().text()
  if(scoped){
   if(resource==='bf_organizations'&&['POST','DELETE'].includes(method))return denied()
   const column=resource==='bf_organizations'?'id':'organization_id'
   const clause=shared.has(resource)?`or(${column}.is.null,${column}.eq.${MEDICAL_COMPANY_ID})`:`${column}.eq.${MEDICAL_COMPANY_ID}`
   const prior=url.searchParams.getAll('and').map(and=>'and'+and)
   url.searchParams.set('and','('+[...prior,clause].join(',')+')')
   if(['POST','PATCH'].includes(method)&&typeof next.body==='string'){
    let body
    try{body=JSON.parse(next.body)}catch{return denied()}
    const rows=Array.isArray(body)?body:[body]
    if(rows.some(row=>!acceptsCompany(row[column])))return denied()
    if(method==='POST'&&!shared.has(resource))for(const row of rows)row[column]=MEDICAL_COMPANY_ID
    next.body=JSON.stringify(body)
   }
  }
  if(rpc&&typeof next.body==='string'){
   let body
   try{body=JSON.parse(next.body)}catch{return denied()}
   if(!validRpcScope(body))return denied()
   for(const key of ['p_org','p_organization','p_organization_id'])if(key in body)body[key]=MEDICAL_COMPANY_ID
   next.body=JSON.stringify(body)
  }
  // Supabase REST calls use URL strings; retain Request headers when present.
  const requestInput=input instanceof Request?new Request(url,input):url.toString()
  const response=await baseFetch(requestInput,next)
  if(!rpc||!response.ok||!response.headers.get('content-type')?.includes('json'))return response
  const result=scopeMedicalResult(await response.json())
  const headers=new Headers(response.headers);headers.delete('content-length')
  return new Response(JSON.stringify(result),{status:response.status,statusText:response.statusText,headers})
 }
}
