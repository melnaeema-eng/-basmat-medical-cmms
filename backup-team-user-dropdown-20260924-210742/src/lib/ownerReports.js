import {supabase} from './supabaseClient'

const doneStatuses=new Set(['closed','completed','complete','done','finished'])
const cancelledStatuses=new Set(['cancelled','canceled'])
const lower=v=>String(v??'').toLowerCase()
const inPeriod=(row,start,end)=>{
 const raw=row.completed_at||row.closed_at||row.finished_at||row.updated_at||row.created_at||row.due_date||row.scheduled_date
 if(!raw)return true
 const d=new Date(raw)
 return d>=new Date(start+'T00:00:00')&&d<=new Date(end+'T23:59:59')
}
const isDone=row=>doneStatuses.has(lower(row.status))
const isCancelled=row=>cancelledStatuses.has(lower(row.status))
const isOverdue=row=>{
 if(isDone(row)||isCancelled(row))return false
 const raw=row.due_date||row.scheduled_date||row.target_date
 return raw?new Date(raw)<new Date():false
}
const nameOf=(row,lang='en')=>row?(lang==='ar'?(row.name_ar||row.name||row.name_en||row.code):(row.name_en||row.name||row.name_ar||row.code)):'—'

async function all(table,filters=[]){
 let q=supabase.from(table).select('*')
 for(const [k,v] of filters)if(v!==''&&v!=null)q=q.eq(k,v)
 const {data,error}=await q
 if(error)throw error
 return data||[]
}
async function optional(table,filters=[]){
 try{return await all(table,filters)}catch{return[]}
}

export async function loadOwnerReportDirectory(){
 const [organizations,clients,sites,contracts]=await Promise.all([
  all('bf_organizations'),all('bf_clients'),all('bf_sites'),all('bf_contracts')
 ])
 return {organizations,clients,sites,contracts}
}

export async function loadBranding(contractId){
 const {data,error}=await supabase.from('bf_owner_report_branding').select('*').eq('contract_id',contractId).maybeSingle()
 if(error)throw error
 return data
}
export async function saveBranding(payload){
 const {data,error}=await supabase.from('bf_owner_report_branding').upsert(payload,{onConflict:'contract_id'}).select('*').single()
 if(error)throw error
 return data
}
export async function archiveOwnerReport(payload){
 const {data,error}=await supabase.from('bf_owner_report_runs').insert(payload).select('*').single()
 if(error)throw error
 return data
}
export async function loadArchivedReports(contractId=''){
 let q=supabase.from('bf_owner_report_runs').select('*').order('created_at',{ascending:false}).limit(300)
 if(contractId)q=q.eq('contract_id',contractId)
 const {data,error}=await q
 if(error)throw error
 return data||[]
}
export async function loadReportEvents(reportRunId){
 const {data,error}=await supabase.from('bf_owner_report_events').select('*').eq('report_run_id',reportRunId).order('created_at',{ascending:false}).limit(100)
 if(error)throw error
 return data||[]
}
async function addEvent(reportRunId,action,{recipient='',notes=''}={}){
 const {data,error}=await supabase.from('bf_owner_report_events').insert({
  report_run_id:reportRunId,action,recipient:recipient||null,notes:notes||null
 }).select('*').single()
 if(error)throw error
 return data
}
export async function markReportPrinted(reportRunId){
 const now=new Date().toISOString()
 const {data:current,error:readError}=await supabase.from('bf_owner_report_runs').select('print_count').eq('id',reportRunId).single()
 if(readError)throw readError
 const {data,error}=await supabase.from('bf_owner_report_runs').update({
  print_count:(current?.print_count||0)+1,last_printed_at:now,distribution_status:'printed'
 }).eq('id',reportRunId).select('*').single()
 if(error)throw error
 await addEvent(reportRunId,'printed')
 return data
}
export async function markReportSent(reportRunId,{recipient,notes=''}) {
 const now=new Date().toISOString()
 const {data,error}=await supabase.from('bf_owner_report_runs').update({
  sent_at:now,sent_to:recipient||null,distribution_status:'sent'
 }).eq('id',reportRunId).select('*').single()
 if(error)throw error
 await addEvent(reportRunId,'sent',{recipient,notes})
 return data
}
export async function markReportAcknowledged(reportRunId,{notes='' }={}) {
 const now=new Date().toISOString()
 const {data,error}=await supabase.from('bf_owner_report_runs').update({
  acknowledged_at:now,distribution_status:'acknowledged'
 }).eq('id',reportRunId).select('*').single()
 if(error)throw error
 await addEvent(reportRunId,'acknowledged',{notes})
 return data
}

export async function loadOwnerReportData({contractId,start,end,lang='en'}){
 const {data:contract,error}=await supabase.from('bf_contracts').select('*').eq('id',contractId).single()
 if(error)throw error

 const [organization,client,sites,workOrders,ppmJobs]=await Promise.all([
  all('bf_organizations',[['id',contract.organization_id]]).then(x=>x[0]||null),
  all('bf_clients',[['id',contract.client_id]]).then(x=>x[0]||null),
  all('bf_sites',[['contract_id',contractId]]),
  optional('bf_work_orders',[['contract_id',contractId]]),
  optional('bf_ppm_jobs',[['contract_id',contractId]])
 ])

 const siteIds=sites.map(x=>x.id)
 let assets=[]
 if(siteIds.length){
  const {data,error:aerr}=await supabase.from('bf_assets').select('*').in('site_id',siteIds)
  if(!aerr)assets=data||[]
 }

 const wo=workOrders.filter(x=>inPeriod(x,start,end))
 const ppm=ppmJobs.filter(x=>inPeriod(x,start,end))
 const completedWO=wo.filter(isDone)
 const openWO=wo.filter(x=>!isDone(x)&&!isCancelled(x))
 const overdueWO=openWO.filter(isOverdue)
 const criticalWO=openWO.filter(x=>['p1','critical','emergency'].includes(lower(x.priority)))
 const completedPPM=ppm.filter(isDone)
 const overduePPM=ppm.filter(isOverdue)
 const ppmCompliance=ppm.length?Math.round((completedPPM.length/ppm.length)*100):0
 const woClosure=wo.length?Math.round((completedWO.length/wo.length)*100):0

 const slaValues=wo.map(x=>lower(x.sla_status)).filter(Boolean)
 const slaMet=slaValues.filter(x=>['met','within_sla','compliant','passed'].includes(x)).length
 const slaBreached=slaValues.filter(x=>['breached','missed','overdue','failed'].includes(x)).length
 const slaRate=(slaMet+slaBreached)?Math.round(slaMet/(slaMet+slaBreached)*100):null

 const criticalAssets=assets.filter(x=>lower(x.criticality)==='critical'&&lower(x.status)!=='archived')
 const warrantyEnding=assets.filter(x=>{
  if(!x.warranty_end)return false
  const d=new Date(x.warranty_end)
  return d>=new Date(start+'T00:00:00')&&d<=new Date(end+'T23:59:59')
 })

 const byStatus=list=>Object.entries(list.reduce((a,x)=>{const k=x.status||'unknown';a[k]=(a[k]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1])
 const byPriority=list=>Object.entries(list.reduce((a,x)=>{const k=x.priority||'N/A';a[k]=(a[k]||0)+1;return a},{})).sort((a,b)=>b[1]-a[1])

 return {
  contract,organization,client,sites,assets,wo,ppm,
  metrics:{
   totalWO:wo.length,completedWO:completedWO.length,openWO:openWO.length,overdueWO:overdueWO.length,criticalWO:criticalWO.length,
   totalPPM:ppm.length,completedPPM:completedPPM.length,overduePPM:overduePPM.length,ppmCompliance,woClosure,
   assets:assets.filter(x=>lower(x.status)!=='archived').length,criticalAssets:criticalAssets.length,warrantyEnding:warrantyEnding.length,
   slaRate
  },
  woStatus:byStatus(wo),ppmStatus:byStatus(ppm),woPriority:byPriority(wo),
  labels:{
   organization:nameOf(organization,lang),client:nameOf(client,lang),
   contract:contract.contract_number||contract.number||contract.code||contract.id
  }
 }
}
