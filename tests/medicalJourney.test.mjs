import test from 'node:test'
import assert from 'node:assert/strict'
import {latestOwnerApproval,journeyState,finishMedicalJourney} from '../src/lib/medicalJourney.js'

test('Supervisor approval and legacy closure do not imply owner acceptance or a certificate',()=>{
 for(const status of ['approved','closed']){
  const state=journeyState({status},null)
  assert.deepEqual(state.steps,[true,true,true,true,false,false,false])
  assert.equal(state.next,4)
 }
})
test('A later rejected round supersedes an earlier accepted round for the same record only',()=>{
 const rows=[
  {id:'old',entity_type:'work_order',entity_id:'wo',reviewer_type:'owner',round:1,status:'approved'},
  {id:'new',entity_type:'work_order',entity_id:'wo',reviewer_type:'owner',round:2,status:'rejected'},
  {id:'other',entity_type:'ppm_job',entity_id:'wo',reviewer_type:'owner',round:3,status:'approved'}
 ]
 const latest=latestOwnerApproval(rows,'work_order','wo')
 assert.equal(latest.id,'new')
 assert.equal(journeyState({status:'approved'},latest).steps[4],false)
})
test('Only a final certificate for the accepted approval completes certification',()=>{
 const owner={id:'current',status:'approved'}
 const cert={document_type:'approval_certificate',entity_type:'approval',entity_id:'current',status:'final'}
 for(const changed of [{entity_id:'old'},{status:'void'},{document_type:'technical_report'},{entity_type:'work_order'}]){
  assert.equal(journeyState({status:'closed'},owner,[{...cert,...changed}]).steps[5],false)
 }
 assert.deepEqual(journeyState({status:'closed'},owner,[cert]).steps,Array(7).fill(true))
 assert.equal(journeyState({status:'approved'},owner,[cert]).next,6)
})
test('Cancelled work does not advertise an actionable next stage',()=>{
 assert.equal(journeyState({status:'cancelled'},null).next,-1)
 assert.equal(journeyState({status:'cancelled'},null).cancelled,true)
})

test('Combined closeout generates the certificate before closing and resumes without duplication',async()=>{
 const record={status:'approved'},owner={id:'a',status:'approved'},calls=[]
 const cert={document_type:'approval_certificate',entity_type:'approval',entity_id:'a',status:'final'}
 let documents=[]
 const read=async()=>({documents,eligible:[cert]})
 const generate=async()=>{calls.push('certificate');documents=[cert]}
 await assert.rejects(finishMedicalJourney({record,owner,read,generate,close:async()=>{calls.push('close');throw Error('close rejected')}}),/close rejected/)
 await finishMedicalJourney({record,owner,read,generate,close:async()=>{calls.push('close')}})
 assert.deepEqual(calls,['certificate','close','close'])
})
test('Closeout refuses missing acceptance, eligibility, and failed certificate generation',async()=>{
 let closed=false
 const base={record:{status:'approved'},owner:{id:'a',status:'approved'},read:async()=>({documents:[],eligible:[]}),generate:async()=>{},close:async()=>{closed=true}}
 await assert.rejects(finishMedicalJourney({...base,owner:{status:'pending'}}),/Owner acceptance/)
 await assert.rejects(finishMedicalJourney(base),/permission/)
 await assert.rejects(finishMedicalJourney({...base,read:async()=>({documents:[],eligible:[{document_type:'approval_certificate',entity_type:'approval',entity_id:'a'}]}),generate:async()=>{throw Error('generation failed')}}),/generation failed/)
 assert.equal(closed,false)
})
