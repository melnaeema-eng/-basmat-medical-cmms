import test from 'node:test'
import assert from 'node:assert/strict'
import {ownerReportModel,ownerReportPeriod,riyadhDay} from '../src/lib/ownerReportModel.js'
import {readOwnerReportData,ownerReportRows} from '../src/lib/ownerReportData.js'
const start='2026-11-01',end='2026-11-30',now='2026-11-10T10:00:00Z'
const base={start,end,now,assets:[{id:'asset',asset_tag:'AST-25',site_id:'site',name_ar:'جهاز التدريب'}],sites:[{id:'site',name:'المستشفى'}]}
test('Work order cohorts use creation date, distinguish technical completion from closure, and exclude cancellations from ratios',()=>{
 const report=ownerReportModel({...base,workOrders:[{id:'closed',created_at:'2026-11-03T10:00:00Z',status:'closed'},{id:'done',created_at:'2026-11-04T10:00:00Z',status:'completed'},{id:'cancelled',created_at:'2026-11-05T10:00:00Z',status:'cancelled'},{id:'old',created_at:'2026-10-03T10:00:00Z',completed_at:'2026-11-02T10:00:00Z',status:'closed'}]})
 assert.equal(report.metrics.totalWO,3);assert.equal(report.metrics.completedWO,2);assert.equal(report.metrics.closedWO,1);assert.equal(report.metrics.woClosure,50);assert.equal(report.awaitingClose.length,1)
})
test('Zero denominators are unavailable; future and cancelled PPM jobs do not reduce execution of due work',()=>{
 const empty=ownerReportModel(base);assert.equal(empty.metrics.woClosure,null);assert.equal(empty.metrics.ppmCompliance,null)
 const r=ownerReportModel({...base,ppmJobs:[{due_date:'2026-11-09',status:'closed'},{due_date:'2026-11-20',status:'scheduled'},{due_date:'2026-11-05',status:'cancelled'}]})
 assert.equal(r.metrics.totalPPM,2);assert.equal(r.metrics.duePPM,1);assert.equal(r.metrics.ppmCompliance,100)
})
test('Backlog includes earlier work; overdue uses real completion deadlines and excludes completed work',()=>{
 const r=ownerReportModel({...base,workOrders:[{id:'old-open',created_at:'2026-10-01',status:'in_progress',completion_due_at:'2026-11-10T09:00:00Z'},{id:'closed',created_at:'2026-10-01',status:'closed',completion_due_at:'2026-10-02'}]})
 assert.equal(r.metrics.totalWO,0);assert.equal(r.metrics.openWO,1);assert.equal(r.metrics.overdueWO,1)
})
test('Repeated-device analysis excludes linked PPM orders and retains next-period preventive work',()=>{
 const r=ownerReportModel({...base,lang:'ar',workOrders:[{id:'c1',asset_id:'asset',site_id:'site',created_at:'2026-11-02',status:'closed'},{id:'c2',asset_id:'asset',site_id:'site',created_at:'2026-11-03',status:'closed'},{id:'p1',asset_id:'asset',site_id:'site',created_at:'2026-11-04',status:'closed'}],ppmJobs:[{work_order_id:'p1',due_date:'2026-11-04',status:'closed'},{due_date:'2026-12-01',status:'scheduled',asset_id:'asset',site_id:'site'}]})
 assert.equal(r.repeatedAssets[0].count,2);assert.equal(r.upcoming.length,1);assert.match(r.upcoming[0].asset_label,/AST-25/);assert.equal(r.upcoming[0].site_name,'المستشفى')
})
test('Riyadh period defaults preserve the first calendar day and annual breakdown includes twelve months',()=>{
 assert.deepEqual(ownerReportPeriod('monthly','2026-11-01T00:05:00+03:00'),['2026-11-01','2026-11-30'])
 assert.equal(riyadhDay('2026-10-31T22:00:00Z'),'2026-11-01')
 const annual=ownerReportModel({...base,start:'2026-01-01',end:'2026-12-31',reportType:'annual'});assert.equal(annual.trend.length,12)
})
function client({failJobs=false}={}){
 const calls=[]
 const data={bf_contracts:[{id:'contract',organization_id:'org',client_id:'owner',contract_number:'MED-1'}],bf_organizations:[{id:'org',name:'Company'}],bf_clients:[{id:'owner',organization_id:'org',name:'Owner'}],bf_sites:[{id:'site',organization_id:'org',client_id:'owner',contract_id:'contract',name:'Hospital'}],bf_work_orders:[{id:'wo',organization_id:'org',client_id:'owner',contract_id:'contract',created_at:'2026-11-09',status:'closed',site_id:'site',asset_id:'asset'}],bf_ppm_jobs:[{id:'ppm',organization_id:'org',client_id:'owner',bf_ppm_plans:{contract_id:'contract'},due_date:'2026-11-09',status:'closed',site_id:'site',asset_id:'asset'}],bf_assets:[{id:'asset',organization_id:'org',client_id:'owner',site_id:'site',asset_tag:'AST-25'}]}
 return {calls,from(table){const call={table,filters:[]};calls.push(call);let single=false;return {select(columns){call.columns=columns;return this},order(){return this},range(a,b){call.range=[a,b];return this},eq(k,v){call.filters.push([k,v]);return this},single(){single=true;return this},then(resolve,reject){if(failJobs&&table==='bf_ppm_jobs')return Promise.resolve({error:{code:'42501',message:'denied'}}).then(resolve,reject);let rows=(data[table]||[]).filter(r=>call.filters.every(([k,v])=>k.split('.').reduce((a,p)=>a?.[p],r)===v));return Promise.resolve({data:single?rows[0]:rows}).then(resolve,reject)}}}}
}
test('Owner report reads PPM through its plan contract and retains organization and owner filters',async()=>{
 const db=client();const r=await readOwnerReportData(db,{contractId:'contract',organizationId:'org',start,end,lang:'en'})
 assert.equal(r.metrics.totalWO,1);assert.equal(r.metrics.totalPPM,1)
 const call=db.calls.find(c=>c.table==='bf_ppm_jobs');assert.match(call.columns,/bf_ppm_plans!inner/);assert(call.filters.some(([k,v])=>k==='bf_ppm_plans.contract_id'&&v==='contract'));assert(call.filters.some(([k,v])=>k==='organization_id'&&v==='org'));assert(call.filters.some(([k,v])=>k==='client_id'&&v==='owner'));assert(!call.filters.some(([k])=>k==='contract_id'))
})
test('Read failures propagate instead of becoming zero reports; cross-company contract selection is rejected',async()=>{
 await assert.rejects(readOwnerReportData(client({failJobs:true}),{contractId:'contract',start,end}),e=>e.code==='42501')
 await assert.rejects(readOwnerReportData(client(),{contractId:'contract',organizationId:'another-company',start,end}),/does not belong/)
})
test('Owner scope requires an explicit company and owner and does not silently widen a contract report',async()=>{
 await assert.rejects(readOwnerReportData(client(),{start,end}),/Select a company/)
 const db=client();const r=await readOwnerReportData(db,{organizationId:'org',clientId:'owner',start,end});assert.equal(r.scope,'owner');assert.equal(r.contract,null)
 assert(!db.calls.find(c=>c.table==='bf_ppm_jobs').filters.some(([k])=>k.includes('contract_id')))
})
test('Paged reads continue beyond the first 500 records',async()=>{
 const dataset=Array.from({length:501},(_,id)=>({id}));let calls=0
 const db={from(){let bounds;return {select(){return this},order(){return this},range(a,b){bounds=[a,b];return this},then(resolve){calls++;return Promise.resolve(resolve({data:dataset.slice(bounds[0],bounds[1]+1)}))}}}}
 assert.equal((await ownerReportRows(db,'table')).length,501);assert.equal(calls,2)
})
