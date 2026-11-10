import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const source=await readFile(new URL('../src/lib/masterAssetLibrary.js',import.meta.url),'utf8')
async function load(db,key){
 globalThis[key]=db
 const code=source.replace("import {supabase} from './supabaseClient'",`const supabase=globalThis[${JSON.stringify(key)}]`)
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
function client(fail=false){
 const calls=[]
 return {calls,from(table){
  const call={table,order:[]};calls.push(call)
  return {select(){return this},order(k){call.order.push(k);return this},range(start,end){
   call.start=start
   if(fail&&table==='bf_med_master_pm_steps'&&start===500)return Promise.resolve({error:{message:'Second page denied'}})
   const count=table==='bf_med_master_pm_steps'?1611:table==='bf_med_master_options'?1453:2
   return Promise.resolve({data:Array.from({length:Math.max(0,Math.min(end+1,count)-start)},(_,i)=>({id:`${table}-${start+i}`}))})
  }}
 }}
}
test('Loads all models and steps beyond the API row cap with stable ordering',async()=>{
 const db=client();const mod=await load(db,'medicalLibraryPaging')
 const result=await mod.loadMasterAssetLibrary()
 assert.equal(result.options.length,1453)
 assert.equal(result.steps.length,1611)
 assert.equal(new Set(result.steps.map(x=>x.id)).size,1611)
 assert.ok(db.calls.every(x=>x.order.includes('id')))
 assert.ok(db.calls.some(x=>x.table==='bf_med_master_pm_steps'&&x.start===1500))
})
test('A later-page failure rejects the library instead of showing partial content',async()=>{
 const mod=await load(client(true),'medicalLibraryPageFailure')
 await assert.rejects(mod.loadMasterAssetLibrary(),e=>e.message==='Second page denied')
})
