import test from 'node:test'
import assert from 'node:assert/strict'
import {MEDICAL_COMPANY_ID as id} from '../src/lib/medicalCompanyConfig.js'
import {bindHomeCompany,companyWorkspace,companySelectionChange,syncCompanyControl} from '../src/lib/companyWorkspace.js'
import {createMedicalCompanyFetch,scopeMedicalResult} from '../src/lib/medicalCompanyTransport.js'
test('Medical binds only the existing Basmat membership and hides company administration even for super admins',()=>{
 const access={organizations:[{id:'other'},{id,name:'Basmat'}],home_organization_id:'other'}
 assert.equal(bindHomeCompany(access).home_organization_id,id)
 assert.deepEqual(bindHomeCompany(access).organizations.map(x=>x.id),[id])
 assert.equal(bindHomeCompany({organizations:[{id:'other'}]}).home_organization_id,null)
 assert.equal(bindHomeCompany({organizations:[{id,status:'inactive'}]}).home_organization_id,null)
 const scope=companyWorkspace({...access,super_admin:true},{is_super_admin:true})
 assert.equal(scope.isSuperAdmin,false);assert.equal(scope.companyId,id)
 assert.equal(companySelectionChange(scope,''),id)
 assert.equal(companySelectionChange(scope,id),null)
 assert.equal(companySelectionChange(scope,'other',true),null)
 let value;syncCompanyControl(scope,{value:'',native:true,onChange:e=>{value=e.target.value}});assert.equal(value,id)
})
test('REST queries add Basmat scope before server pagination and retain shared library templates',async()=>{
 const seen=[],fetch=createMedicalCompanyFetch(async(url,options)=>{seen.push([new URL(url),options]);return Response.json([])},'https://db.example')
 await fetch('https://db.example/rest/v1/bf_assets?select=id&and=(status.eq.active)&organization_id=eq.other')
 assert(seen[0][0].searchParams.get('and').includes('and(status.eq.active)'))
 assert(seen[0][0].searchParams.get('and').includes('organization_id.eq.'+id))
 await fetch('https://db.example/rest/v1/bf_organizations?select=id,name')
 assert.equal(seen[1][0].searchParams.get('and'),`(id.eq.${id})`)
 await fetch('https://db.example/rest/v1/bf_asset_categories?select=*')
 assert(seen[2][0].searchParams.get('and').includes('organization_id.is.null'))
 await fetch('https://db.example/auth/v1/token',{method:'POST',body:'unmodified'})
 assert.equal(seen[3][1].body,'unmodified')
})
test('Writes cannot add or switch companies; valid owner inserts bind to Basmat without changing auth',async()=>{
 const seen=[],fetch=createMedicalCompanyFetch(async(url,options)=>{seen.push([url,options]);return Response.json({id:'owner'})},'https://db.example')
 assert.equal((await fetch('https://db.example/rest/v1/bf_organizations',{method:'POST',body:'{}'})).status,403)
 assert.equal((await fetch('https://db.example/rest/v1/bf_clients',{method:'PATCH',body:JSON.stringify({organization_id:'other'})})).status,403)
 await fetch('https://db.example/rest/v1/bf_clients',{method:'POST',body:JSON.stringify({name:'Owner'})})
 assert.equal(JSON.parse(seen[0][1].body).organization_id,id)
 const request=new Request('https://db.example/rest/v1/bf_clients',{method:'POST',headers:{Authorization:'Bearer session'},body:JSON.stringify({name:'Other',organization_id:'other'})})
 assert.equal((await fetch(request)).status,403)
 assert.equal(seen.length,1)
})
test('RPC requests reject other-company scopes and filter other-company results, keeping owners and shared dictionaries',async()=>{
 let called=0
 const fetch=createMedicalCompanyFetch(async(_url,options)=>{called++;assert.equal(JSON.parse(options.body).p_org,id);return Response.json({organizations:[{id},{id:'other'}],projects:[{organization_id:id,name:'Basmat project'},{organization_id:'other'}],manufacturers:[{name:'Manufacturer'}]})},'https://db.example')
 assert.equal((await fetch('https://db.example/rest/v1/rpc/bf4_action',{method:'POST',body:JSON.stringify({p_data:{organization_id:'other'}})})).status,403)
 assert.equal(called,0)
 const result=await (await fetch('https://db.example/rest/v1/rpc/center',{method:'POST',body:JSON.stringify({p_org:null})})).json()
 assert.deepEqual(result.organizations,[{id}]);assert.equal(result.projects.length,1);assert.equal(result.manufacturers.length,1)
 assert.deepEqual(scopeMedicalResult([{organization_id:'other'},{organization_id:id}]),[{organization_id:id}])
})
