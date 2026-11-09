import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const source=await readFile(new URL('../src/lib/medicalAssetCockpit.js',import.meta.url),'utf8')
const start=source.indexOf('export async function searchMedicalAssets(')
const end=source.indexOf('export async function loadAssetActionData(',start)
const search=new Function('supabase',source.slice(start,end).replace('export ','')+';return searchMedicalAssets')

test('Device searches require an organization and constrain the database query before its limit',async()=>{
  const calls=[]
  const rows=[{asset_tag:'AST-18',organization_id:'company-a',model:'CT'}]
  const query={select(){return this},eq(...args){calls.push(['eq',...args]);return this},order(){return this},limit(){calls.push(['limit']);return Promise.resolve({data:rows})}}
  const find=search({from(){calls.push(['from']);return query}})
  assert.deepEqual(await find('CT'),[])
  assert.deepEqual(calls,[])
  assert.deepEqual(await find('CT','company-a'),rows)
  assert.deepEqual(calls,[['from'],['eq','organization_id','company-a'],['limit']])
})
