import {ownerReportRows,readOwnerReportData} from './ownerReportData'
import {supabase} from './supabaseClient'

const all=(...args)=>ownerReportRows(supabase,...args)

export async function loadOwnerReportDirectory(){
 const [organizations,clients,sites,contracts]=await Promise.all([
  all('bf_organizations',[],'id,name,name_ar,name_en,code,status'),all('bf_clients',[],'id,organization_id,name,code,status,logo_url'),all('bf_sites',[],'id,organization_id,client_id,contract_id,name,code,status'),all('bf_contracts',[],'id,organization_id,client_id,contract_number,status,start_date,end_date')
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

export const loadOwnerReportData=options=>readOwnerReportData(supabase,options)
