import test from 'node:test'
import assert from 'node:assert/strict'
import {MEDICAL_COMPANY_ID as basmat} from '../src/lib/medicalCompanyConfig.js'
import {bindHomeCompany,companyWorkspace,hasOwnerPortalAccess,companySelectionChange} from '../src/lib/companyWorkspace.js'
import {createMedicalCompanyFetch,scopeMedicalResult} from '../src/lib/medicalCompanyTransport.js'

const company='11111111-1111-4111-8111-111111111111'
const origin='https://db.example'
const endpoint=path=>origin+'/rest/v1/'+path
const configured=(handler,companyId=company,isPlatformAdmin=false)=>createMedicalCompanyFetch(handler,origin,()=>({companyId,isPlatformAdmin}))

test('One verified home company for staff and switching for the platform administrator',()=>{
 const memberships=[{id:basmat},{id:company}]
 assert.equal(bindHomeCompany({organizations:memberships}).home_organization_id,null)
 const access=bindHomeCompany({organizations:memberships},{home_organization_id:company})
 assert.equal(access.home_organization_id,company)
 assert.equal(companySelectionChange(companyWorkspace(access),basmat),company)
 assert.equal(companyWorkspace(access,{is_super_admin:true}).isSuperAdmin,true)
 assert.equal(companySelectionChange(companyWorkspace({...access,super_admin:true}),basmat),null)
})

test('Owner portal requires an assigned owner representative for that company',()=>{
 const access={organizations:[{id:company},{id:basmat}],role_assignments:[{organization_id:company,role_code:'owner_rep'}],projects:[{organization_id:company,client_id:'owner',status:'active'}]}
 assert.equal(hasOwnerPortalAccess(access),true)
 assert.equal(hasOwnerPortalAccess({...access,projects:[{organization_id:basmat,client_id:'owner'}]}),false)
 assert.equal(hasOwnerPortalAccess({...access,role_assignments:[],super_admin:true}),false)
})

test('Workspace changes rescope subsequent REST reads before pagination',async()=>{
 const seen=[]
 let companyId=basmat
 const fetch=createMedicalCompanyFetch(async(url,opts)=>{seen.push([new URL(url),opts]);return Response.json([])},origin,()=>({companyId,isPlatformAdmin:true}))
 await fetch(endpoint('bf_assets?select=id&and=(status.eq.active)'))
 companyId=company
 await fetch(endpoint('bf_assets?select=id&and=(status.eq.active)'))
 await fetch(endpoint('bf_asset_categories'))
 assert(seen[0][0].searchParams.get('and').includes('organization_id.eq.'+basmat))
 assert(seen[1][0].searchParams.get('and').includes('organization_id.eq.'+company))
 assert(seen[1][0].searchParams.get('and').includes('and(status.eq.active)'))
 assert(seen[2][0].searchParams.get('and').includes('organization_id.is.null'))
})

test('Staff cannot submit writes targeting another company',async()=>{
 const seen=[],fetch=configured(async(url,options)=>{seen.push([url,options]);return Response.json({id:'owner'})})
 assert.equal((await fetch(endpoint('bf_organizations'),{method:'POST',body:'{}'})).status,403)
 assert.equal((await fetch(endpoint('bf_clients'),{method:'PATCH',body:JSON.stringify({organization_id:basmat})})).status,403)
 await fetch(endpoint('bf_clients'),{method:'POST',body:JSON.stringify({name:'Owner'})})
 assert.equal(JSON.parse(seen[0][1].body).organization_id,company)
 assert.equal(seen.length,1)
})

test('Operational RPCs stay scoped; bootstrap and platform directory retain verified alternatives',async()=>{
 let calls=0
 const handle=async(url,options)=>{
  calls++
  if(new URL(url).pathname.endsWith('/center'))assert.equal(JSON.parse(options.body).p_org,company)
  return Response.json({organizations:[{id:company},{id:basmat}],projects:[{organization_id:company},{organization_id:basmat}],manufacturers:[{name:'Manufacturer'}]})
 }
 const fetch=configured(handle),platform=configured(handle,company,true)
 assert.equal((await fetch(endpoint('rpc/bf4_action'),{method:'POST',body:JSON.stringify({p_data:{organization_id:basmat}})})).status,403)
 assert.equal(calls,0)
 const scoped=await (await fetch(endpoint('rpc/center'),{method:'POST',body:'{"p_org":null}'})).json()
 assert.deepEqual(scoped.organizations,[{id:company}]);assert.equal(scoped.projects.length,1)
 assert.equal(scoped.manufacturers.length,1)
 const bootstrap=await (await fetch(endpoint('rpc/bf_acl_my_context'),{method:'POST',body:'{}'})).json()
 assert.equal(bootstrap.organizations.length,2)
 const directory=await (await platform(endpoint('rpc/bf_fac_company_workspace_directory'),{method:'POST',body:'{}'})).json()
 assert.equal(directory.organizations.length,2)
 assert.deepEqual(scopeMedicalResult([{organization_id:basmat},{organization_id:company}],company),[{organization_id:company}])
})
