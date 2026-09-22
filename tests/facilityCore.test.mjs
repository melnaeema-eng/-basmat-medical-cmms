import test from 'node:test'
import assert from 'node:assert/strict'
import {active,display,code,locationLabel} from '../src/lib/facilityCore.js'
test('Arabic and English names respect the selected language',()=>{
 assert.equal(display({name_ar:'مضخة',name_en:'Pump'},'ar'),'مضخة')
 assert.equal(display({name_ar:'مضخة',name_en:'Pump'},'en'),'Pump')
 assert.equal(display({name_en:'Pump'},'ar'),'Pump')
})
test('Archived records are excluded from active selectors',()=>{
 assert.deepEqual(active([{id:1,status:'active'},{id:2,status:'archived'}]).map(x=>x.id),[1])
 assert.deepEqual(active(null),[])
})
test('New asset codes have the requested prefix and distinct identifiers',()=>{
 const a=code('AST'),b=code('AST')
 assert.match(a,/^AST-[A-F0-9]{8}$/)
 assert.notEqual(a,b)
})
test('Location labels follow the correct parent hierarchy',()=>{
 const data={sites:[{id:'s',name:'Site'}],buildings:[{id:'b',name_en:'Building'}],floors:[{id:'f',name_en:'Floor'}],zones:[{id:'z',name_en:'Zone'}],rooms:[{id:'r',name_en:'Room'}]}
 const asset={site_id:'s',building_id:'b',floor_id:'f',zone_id:'z',room_id:'r'}
 assert.equal(locationLabel(asset,data,'en'),'Site / Building / Floor / Zone / Room')
})
