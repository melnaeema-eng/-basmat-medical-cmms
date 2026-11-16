import test from 'node:test'
import assert from 'node:assert/strict'
import {bindHomeCompany,companyWorkspace,companySelectionChange,syncCompanyControl,isCompanyAdministrationPath} from '../src/lib/companyWorkspace.js'
const organizations=[{organization_id:'a',name:'Company A'},{id:'b',name:'Company B'}]
test('uses the server home company from existing active memberships, including multiple memberships',()=>{
 const bound=bindHomeCompany({organizations},{home_organization_id:'b'})
 assert.equal(bound.home_organization_id,'b');assert.equal(bound.home_organization.id,'b')
 assert.equal(companyWorkspace(bound,{}).companyId,'b')
})
test('never arbitrarily selects the first company when the home assignment is ambiguous',()=>{
 assert.equal(bindHomeCompany({organizations}).home_organization_id,null)
 assert.equal(bindHomeCompany({organizations},{home_organization_id:'outside-membership'}).home_organization_id,null)
 assert.equal(bindHomeCompany({organizations:[organizations[0]]}).home_organization_id,'a')
 assert.equal(bindHomeCompany({organizations:[{id:'a',status:'inactive'},{id:'b',is_active:false}]}).home_organization_id,null)
})
test('only explicit platform super-admin flags enable company administration',()=>{
 assert.equal(companyWorkspace({organizations,roles:[{role_code:'org_admin'}]},{}).isSuperAdmin,false)
 assert.equal(companyWorkspace({super_admin:'true'},{}).isSuperAdmin,false)
 assert.equal(companyWorkspace({super_admin:true},{}).isSuperAdmin,true)
 assert.equal(companyWorkspace({}, {is_super_admin:true}).isSuperAdmin,true)
})
test('auto-fills a new form and corrects a stale company without resetting a correctly bound form',()=>{
 const scope={companyId:'b',isSuperAdmin:false}
 assert.equal(companySelectionChange(scope,''),'b')
 assert.equal(companySelectionChange(scope,'a'),'b')
 assert.equal(companySelectionChange(scope,'b'),null)
 assert.equal(companySelectionChange(scope,'a',true),null)
 assert.equal(companySelectionChange({...scope,isSuperAdmin:true},'a'),null)
})
test('keeps existing reset handlers for both native selects and Choice/Select controls',()=>{
 const scope={companyId:'b',isSuperAdmin:false},calls=[]
 syncCompanyControl(scope,{value:'a',native:true,onChange:e=>calls.push({company:e.target.value,project:''})})
 syncCompanyControl(scope,{value:'',onChange:v=>calls.push({company:v,site:''})})
 syncCompanyControl(scope,{value:'b',onChange:()=>assert.fail('Already correct; do not reset dependent fields')})
 syncCompanyControl(scope,{value:'owner-a',onChange:()=>assert.fail('Do not replace an owner or consultant')},false)
 assert.deepEqual(calls,[{company:'b',project:''},{company:'b',site:''}])
})
test('guards company administration URLs while keeping projects, owners and manufacturers available',()=>{
 for(const p of ['/maintenance-companies','/organizations','/organizations/new','/medical-knowledge-library','/facility-reference-library','/medical-service-library'])assert.equal(isCompanyAdministrationPath(p),true,p)
 for(const p of ['/project-setup','/owners','/asset-library','/corrective','/organizations-report'])assert.equal(isCompanyAdministrationPath(p),false,p)
})

import {loadEffectiveAccess} from '../src/lib/accessContext.js'
test('medical access loads its canonical home without inventing permissions from role labels',async()=>{
 const result=await loadEffectiveAccess({organizations,permissions:[]},async(name,args)=>{
  if(name==='bf3_my_access')return {data:{home_organization_id:'b',roles:[{organization_id:'b',permission:'reports.view'}]}}
  if(name==='bf_can')return {data:false}
  throw Error('Unexpected RPC')
 })
 assert.equal(result.home_organization_id,'b');assert.deepEqual(result.permissions,[])
})
