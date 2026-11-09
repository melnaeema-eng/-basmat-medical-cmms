import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAccessContext,loadEffectiveAccess} from '../src/lib/accessContext.js'

const org={organization_id:'a',name:'Basmat',status:'active'}
test('A sole server-returned membership supplies the same home organization to header and identity',()=>{
 const a=normalizeAccessContext({organizations:[org],roles:[{role_id:'technician',organization_id:'a'}]})
 assert.equal(a.home_organization_id,'a')
 assert.equal(a.home_organization.name,'Basmat')
 assert.equal(a.role_assignments[0].role_id,'technician')
 assert.deepEqual(a.permissions,[])
})
test('Ambiguous membership is not selected from array order or inferred from role names',()=>{
 const a=normalizeAccessContext({organizations:[org,{id:'b'}],roles:[{organization_id:'a',role_code:'org_admin'}]})
 assert.equal(a.home_organization_id,null)
 assert.deepEqual(a.permissions,[])
 assert.equal(normalizeAccessContext({...a,home_organization_id:'b'}).home_organization_id,'b')
})
test('Permission shapes are normalized only within active known memberships',()=>{
 const a=normalizeAccessContext({organizations:[org,{id:'b',is_active:false}],permissions:[
  {organization_id:'a',permission:'assets.view'},
  {organization_id:'a',permission_key:'assets.view'},
  {organization_id:'b',permission:'users.manage'},
  {organization_id:'other',permission:'*'},
  {organization_id:'a',permission:'ppm.execute',is_allowed:false}
 ]})
 assert.deepEqual(a.permissions.map(p=>p.permission_key),['assets.view'])
})
test('Legacy grants require a fresh positive backend permission check and matching organization',async()=>{
 const calls=[]
 const a=await loadEffectiveAccess({organizations:[org]},async(name,args)=>{
  calls.push([name,args])
  if(name==='bf3_my_access')return {data:{super_admin:true,roles:[
   {organization_id:'a',permission:'corrective.view'},
   {organization_id:'a',permission:'corrective.execute'},
   {organization_id:'other',permission:'users.manage'}
  ]}}
  return {data:args.p_permission==='corrective.view'}
 })
 assert.deepEqual(a.permissions.map(p=>p.permission_key),['corrective.view'])
 assert.equal(a.super_admin,undefined)
 assert.equal(calls.length,3)
})
test('Explicit ACL denial and restricted ACL grants cannot be replaced by broader legacy grants',async()=>{
 const payload={organizations:[org],permissions:[
  {organization_id:'a',permission_key:'medical.work_orders.execute',is_allowed:false},
  {organization_id:'a',permission_key:'medical.assets.view',project_id:'limited'}
 ]}
 const a=await loadEffectiveAccess(payload,async(name)=>{
  assert.equal(name,'bf3_my_access')
  return {data:{roles:[{organization_id:'a',permission:'corrective.execute'},{organization_id:'a',permission:'assets.view'}]}}
 })
 assert.deepEqual(a.permissions.map(p=>[p.permission_key,p.project_id]),[['medical.assets.view','limited']])
})
test('Unavailable compatibility RPCs retain canonical grants without inventing permissions',async()=>{
 const payload={organizations:[org],permissions:[{organization_id:'a',permission_key:'medical.assets.view'}]}
 const a=await loadEffectiveAccess(payload,async()=>{throw Error('unavailable')})
 assert.deepEqual(a.permissions.map(p=>p.permission_key),['medical.assets.view'])
})
