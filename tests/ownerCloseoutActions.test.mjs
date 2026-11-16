import test from 'node:test'
import assert from 'node:assert/strict'
import {approvalNextAction,canDecideOwnerApproval,canFinishApprovedJourney} from '../src/lib/medicalJourney.js'
const record={status:'approved'},owner={id:'owner-review',status:'approved'},certificate={document_type:'approval_certificate',entity_type:'approval',entity_id:'owner-review',status:'final'}
test('WO-2026-000039 regression: internal approval with no owner request leads to submission, never closure',()=>{
 const next=approvalNextAction(record,null,[])
 assert.equal(next.key,'request_owner');assert.match(next.title,/إرساله لقبول المالك/)
 assert.equal(canFinishApprovedJourney(record,null,[],[certificate],true),false)
})
test('pending, returned and accepted owner decisions each show the correct next responsible role',()=>{
 assert.equal(approvalNextAction(record,{status:'pending'},[]).key,'owner_review')
 assert.equal(approvalNextAction(record,{status:'rejected'},[]).key,'request_owner')
 assert.equal(approvalNextAction(record,owner,[]).key,'certificate')
 assert.equal(approvalNextAction(record,owner,[certificate]).key,'close')
 assert.equal(approvalNextAction({status:'closed'},owner,[certificate]).terminal,true)
})
test('combined staff/owner roles do not grant self-approval; only the actual owner authorization is used',()=>{
 const review={status:'pending',requested_by:'supervisor'}
 assert.equal(canDecideOwnerApproval(review,'supervisor',true),false)
 assert.equal(canDecideOwnerApproval(review,'different-owner',true),true)
 assert.equal(canDecideOwnerApproval(review,'different-owner',false),false)
 assert.equal(canDecideOwnerApproval(review,null,true),false)
 assert.equal(canDecideOwnerApproval({...review,status:'approved'},'different-owner',true),false)
})
test('certificate issuance and closeout stay unavailable until exact eligibility and owner acceptance are present',()=>{
 assert.equal(canFinishApprovedJourney(record,owner,[],[],true),false)
 assert.equal(canFinishApprovedJourney(record,owner,[],[certificate],false),false)
 assert.equal(canFinishApprovedJourney(record,owner,[],[{...certificate,entity_id:'another-approval'}],true),false)
 assert.equal(canFinishApprovedJourney(record,owner,[],[certificate],true),true)
 assert.equal(canFinishApprovedJourney(record,owner,[certificate],[],true),true)
 assert.equal(canFinishApprovedJourney(record,{...owner,status:'pending'},[certificate],[certificate],true),false)
})
