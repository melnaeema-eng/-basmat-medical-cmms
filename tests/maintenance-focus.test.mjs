import test from 'node:test'
import assert from 'node:assert/strict'
import {maintenanceAction,checklistFocus} from '../src/lib/maintenanceFocus.js'
const steps=[{id:'a',title_en:'Inspect'},{id:'b',title_en:'Test'},{id:'c',title_en:'Record'}]
test('only a persisted result advances the checklist; failed results remain attention items',()=>{
 assert.equal(checklistFocus(steps,[]).next.id,'a')
 assert.equal(checklistFocus(steps,[{step_id:'a',result:''}]).next.id,'a')
 const focus=checklistFocus(steps,[{step_id:'a',result:'fail'}])
 assert.equal(focus.next.id,'b');assert.equal(focus.failed[0].id,'a')
 assert.equal(focus.completed.length,1)
})
test('saved results survive refresh and fully recorded checklist requests submission',()=>{
 const results=steps.map(s=>({step_id:s.id,result:'pass'}))
 assert.equal(checklistFocus(steps,results).next,null)
 assert.equal(maintenanceAction({kind:'ppm',status:'in_progress',assigned:true,steps,results}).key,'submit')
})
test('assignment, acceptance, execution and review transfer responsibility without inventing names',()=>{
 assert.equal(maintenanceAction({status:'draft'}).key,'assign')
 assert.equal(maintenanceAction({status:'assigned',assigned:false}).key,'assign')
 assert.equal(maintenanceAction({status:'assigned',assigned:true,technician:'Magdi'}).responsible,'Magdi')
 assert.equal(maintenanceAction({status:'accepted',assigned:true}).key,'start')
 assert.equal(maintenanceAction({status:'on_hold',assigned:true}).key,'resume')
 assert.equal(maintenanceAction({status:'completed',approvalStatus:'pending'}).key,'review')
 assert.equal(maintenanceAction({status:'completed',approvalStatus:'rejected'}).key,'submit')
 assert.equal(maintenanceAction({kind:'ppm',status:'completed'}).key,'review')
})
test('closed and cancelled records have no next responsible person; integrated approval routes to dossier',()=>{
 for(const status of ['closed','cancelled'])assert.equal(maintenanceAction({status}).terminal,true)
 assert.equal(maintenanceAction({status:'approved',integrated:true}).key,'dossier')
 assert.equal(maintenanceAction({status:'approved'}).key,'close')
})
test('Arabic and English use readable role fallbacks and the next step title',()=>{
 assert.equal(maintenanceAction({status:'in_progress',assigned:true,lang:'en'}).responsible,'Assigned technician')
 assert.equal(maintenanceAction({kind:'ppm',status:'in_progress',assigned:true,lang:'en',steps,results:[{step_id:'a',result:'pass'}]}).title,'Test')
 assert.equal(maintenanceAction({kind:'request',status:'submitted'}).key,'triage')
})

import {executionFocus} from '../src/lib/maintenanceFocus.js'
test('execution packages advance by persisted sequence, retaining reading/text results and failed steps',()=>{
 const steps=[{seq:1},{seq:2},{seq:3}]
 assert.equal(executionFocus(steps,[]).next.seq,1)
 const results=[{step_seq:'1',reading_value:0},{step_seq:2,pass_fail:'fail'}]
 const focus=executionFocus(steps,results)
 assert.equal(focus.next.seq,3);assert.equal(focus.failed[0].seq,2)
 assert.equal(focus.completed.length,2)
 assert.equal(executionFocus(steps,[...results,{step_seq:3,result_text:'Recorded'}]).next,null)
})
