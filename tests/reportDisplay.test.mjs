import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveReportReferences,displayReportValue,prepareReportDisplay} from '../src/lib/reportDisplay.js'
const owner='0a60e09f-dd16-404f-9e80-10ef6029c962',site='25811319-586d-4a32-8b8f-e239c57e271a',visit='50ec7baf-9ced-4dd1-9eb8-1580aea4735e'
function db(fail=false){
 const calls=[]
 return {calls,from(table){const query={table};calls.push(query);return {select(fields){query.fields=fields;return this},in(key,ids){query.ids=ids;return this},eq(key,value){query[key]=value;return this},then(resolve){return Promise.resolve(resolve(fail?{error:{code:'42501'}}:{data:table==='bf_clients'?[{id:owner,name:'وزارة الصحة'}]:table==='bf_sites'?[{id:site,name:'المستشفى'}]:table==='bf9_visits'?[{id:visit,visit_number:'VIS-2026-000010'}]:[]}))}}}}
}
test('Reports replace reference columns with readable names and visit numbers, while preserving source IDs',async()=>{
 const client=db();const source={rows:[{full_name:'فني الاختبار',client_id:owner,site_id:site,visit_id:visit,minutes:4}]}
 const result=await resolveReportReferences(source,'authorized-company',client)
 assert.equal(result.rows[0].owner_name,'وزارة الصحة');assert.equal(result.rows[0].site_name,'المستشفى');assert.equal(result.rows[0].visit_number,'VIS-2026-000010')
 assert.equal(result.rows[0].client_id,owner);assert.equal(source.rows[0].owner_name,undefined)
 assert(client.calls.every(c=>c.organization_id==='authorized-company'))
 assert(client.calls.every(c=>c.ids.length===1))
})
test('Denied reference reads never expose UUIDs in display columns or invent names',async()=>{
 const result=await resolveReportReferences({rows:[{client_id:owner,site_id:site,visit_id:visit}]},'org',db(true))
 assert.equal(result.reference_lookup_unavailable,true)
 assert.equal(result.rows[0].owner_name,null);assert.equal(result.rows[0].site_name,null);assert.equal(result.rows[0].visit_number,null)
})
test('Screen and print/Excel dates use Riyadh time and preserve numeric measurements',()=>{
 const timestamp='2026-11-09T08:11:59+00:00'
 assert.match(displayReportValue(timestamp,'started_at','en'),/11:11/)
 assert.equal(displayReportValue(timestamp,'activity','en'),timestamp)
 const report=prepareReportDisplay({generated_at:timestamp,rows:[{started_at:timestamp,minutes:4}],filters:{start_date:'2026-11-09'}},['started_at','minutes'],'en')
 assert.equal(report.rows[0].minutes,4);assert.match(report.rows[0].started_at,/11:11/)
 assert.doesNotMatch(report.generated_at,/T08:/)
})

test('Printed reports contain names and readable dates without rendering hidden identifiers or HTML in names',async()=>{
 const {printReport}=await import('../src/lib/reportExport.js')
 let html='';globalThis.window={location:{origin:'https://medical.example.test'},open:()=>({document:{open(){},write(v){html=v},close(){}},focus(){}})}
 try{
  const report=prepareReportDisplay({generated_at:'2026-11-09T08:11:59Z',context:{client_name:'Owner & Hospital'},rows:[{client_id:owner,owner_name:'Hospital <script>bad</script>',visit_number:'VIS-2026-000010',started_at:'2026-11-09T08:11:59Z'}]},['owner_name','visit_number','started_at'],'en')
  printReport(report,['owner_name','visit_number','started_at'],{},'Test','en')
  assert(!html.includes(owner));assert(html.includes('VIS-2026-000010'));assert(html.includes('11:11'));assert(html.includes('&lt;script&gt;bad&lt;/script&gt;'));assert(!html.includes('<script>bad</script>'))
 }finally{delete globalThis.window}
})
