import test from 'node:test'
import assert from 'node:assert/strict'
import {setupNextStep,setupProjectScope,setupErrorMessage} from '../src/lib/projectSetupStatus.js'
import {loadPassportLocation,passportLocationFields} from '../src/lib/passportLocation.js'
test('Readiness uses only the selected project sites and active team members',()=>{
 const snapshot=setupProjectScope({projects:[{id:'a',sites:[{site_id:'sa'}]},{id:'b',sites:[{site_id:'sb'}]}],teams:[{project_id:'a',members:[{user_id:'u1',is_active:true},{user_id:'u1',is_active:true},{user_id:'inactive',is_active:false}]},{project_id:'b',members:[{user_id:'other'}]}]},'a')
 assert.deepEqual(snapshot.siteIds,['sa']);assert.deepEqual(snapshot.members.map(x=>x.user_id),['u1'])
})
test('Unavailable checks never imply completed setup or zero missing records',()=>{
 assert.equal(setupNextStep({project:{},sites:1,assets:null,team:1,ppm:1}),1)
 assert.equal(setupNextStep({project:{},sites:1,assets:1,team:1,ppm:null}),2)
 assert.equal(setupNextStep({project:{},sites:1,assets:1,team:1,ppm:1}),null)
 assert.notEqual(setupErrorMessage({}),'[object Object]')
 assert.match(setupErrorMessage({code:'42501'}),/صلاحية/)
})
test('Passport resolves room ancestry and refuses another company or site',async()=>{
 const rows={bf_rooms:{id:'r',zone_id:'z',site_id:'site',name:'Room 1'},bf_zones:{id:'z',floor_id:'f',name:'East'},bf_floors:{id:'f',building_id:'b',name:'Floor 2'},bf_buildings:{id:'b',site_id:'site',organization_id:'org',name:'Building A'},bf_sites:{id:'site',organization_id:'org',name:'Hospital'}}
 const asset={room_id:'r',site_id:'site',organization_id:'org'}
 const data=await loadPassportLocation(asset,async t=>rows[t])
 assert.deepEqual(passportLocationFields(data,'en').map(x=>x.value),['Hospital','Building A','Floor 2','East','Room 1'])
 rows.bf_rooms.site_id='other'
 const rejected=await loadPassportLocation(asset,async(t,id)=>id?rows[t]:null)
 assert.equal(rejected.room,null)
 assert.equal(passportLocationFields(rejected).find(x=>x.key==='room').missing,true)
})
