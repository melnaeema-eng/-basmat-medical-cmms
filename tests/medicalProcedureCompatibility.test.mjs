import {test} from 'node:test'
import assert from 'node:assert/strict'
import {medicalProcedureMatchesAsset as matches} from '../src/lib/medicalProcedureCompatibility.js'

const asset={organization_id:'basmat',category_id:'holter',manufacturer_name:'Philips Healthcare',model:'H-1'}
const procedure={organization_id:'basmat',category_id:'holter',manufacturer:'Philips Healthcare',model:'H-1',status:'approved'}

test('Only an approved procedure for the same company and category is offered',()=>{
 assert.equal(matches(procedure,asset),true)
 for(const changed of [{category_id:'ct'},{organization_id:'other'},{status:'draft'},{status:'archived'}])assert.equal(matches({...procedure,...changed},asset),false)
 assert.equal(matches(procedure,{...asset,category_id:null}),false)
})
test('Device manufacturer and model restrictions are respected',()=>{
 assert.equal(matches({...procedure,manufacturer:'GE'},asset),false)
 assert.equal(matches({...procedure,model:'H-2'},asset),false)
 assert.equal(matches({...procedure,manufacturer:' philips healthcare ',model:' h-1 '},asset),true)
 assert.equal(matches({...procedure,manufacturer:null,model:null},asset),true)
})
