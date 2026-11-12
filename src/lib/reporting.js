import {loadOwnerIdentity} from './ownerIdentity'
import {supabase} from './supabaseClient'
import {resolveReportReferences} from './reportDisplay'
export async function reportScopes(){
 const {data,error}=await supabase.rpc('bf10_scopes')
 if(error)throw error
 return data
}
export async function reportQuery(filters,section='overview',limit=200,offset=0,exporting=false){
 const args={p_org:filters.organization_id,p_start:filters.start_date,p_end:filters.end_date,
  p_client:filters.client_id||null,p_site:filters.site_id||null,p_section:section,
  p_limit:limit,p_offset:offset}
 const {data,error}=await supabase.rpc(exporting?'bf10_export':'bf10_report',args)
 if(error)throw error
 const [report,owner_identity]=await Promise.all([resolveReportReferences(data,filters.organization_id,supabase),loadOwnerIdentity({organizationId:filters.organization_id,clientId:filters.client_id||undefined,siteId:filters.site_id||undefined}).catch(()=>null)])
 return {...report,owner_identity}
}
export async function reportExport(filters,section,onProgress){
 const rows=[];let offset=0;let first=null;let referencesUnavailable=false
 while(true){
  const result=await reportQuery(filters,section,500,offset,true)
  if(!first)first=result
  referencesUnavailable=referencesUnavailable||result.reference_lookup_unavailable
  rows.push(...result.rows)
  onProgress?.(rows.length)
  if(!result.has_more)return {...first,rows,reference_lookup_unavailable:referencesUnavailable,exported_at:new Date().toISOString()}
  if(rows.length>=50000)throw Error('Export limit of 50,000 rows reached. Narrow the date range.')
  offset+=result.rows.length
  if(!result.rows.length)throw Error('Report pagination did not advance')
 }
}
export const reportSections=['overview','work_orders','ppm','technicians','materials','monthly','quality']
export const reportColumns={
 work_orders:['work_order_number','title','priority','status','approval_status','sla_status','created_at','started_at','completed_at','closed_at','completion_due_at','response_minutes','completion_minutes','diagnosis','root_cause','work_performed','owner_name','site_name','asset_name'],
 ppm:['job_number','due_date','status','assigned_technician_name','started_at','completed_at','approved_at','closed_at','failed_steps','corrective_followups','asset_name','owner_name','site_name'],
 technicians:['work_order_number','full_name','started_at','ended_at','minutes','activity','visit_number','owner_name','site_name'],
 materials:['work_order_number','sku','name_ar','name_en','unit','stock_owner_name','lot_code','serial_number','consumed_qty','currency','unit_cost','actual_cost'],
 monthly:['month','created','currently_closed','currently_breached'],
 quality:['work_order_number','action','from_status','to_status','created_at','owner_name','site_name']
}
export const reportDefinitions={
 overview:{work_orders:'WO created in period',open_work_orders:'Currently open',closed_work_orders:'Currently closed',cancelled_work_orders:'Currently cancelled',sla_breached:'Currently marked breached',ppm_due:'PPM jobs due',ppm_closed:'PPM currently closed',ppm_overdue:'PPM overdue today',labor_minutes:'Recorded labor minutes'},
 work_orders:'Work orders are selected by creation date. Status and SLA are current values, not historical state at the end of the range.',
 ppm:'PPM denominator is generated, non-cancelled jobs due within the range. Closed is the current status. Missing schedules are not inferred.',
 technicians:'Actual labor intervals starting within the date range. These are recorded work periods, not verified GPS attendance.',
 materials:'Gross consumption events within the date range multiplied by allocation cost snapshots. Returns and financial reversals are not netted. Legacy Sprint 6 consumption is not included.',
 monthly:'Monthly cohorts use work-order creation dates. Closed and breached counts describe their current status, not the status at month-end.',
 quality:'QA and reopening events within the selected period. Counts are events, not unique work orders.'
}
export function percentage(n,d){return d>0?Math.round(n/d*1000)/10:null}
export function formatValue(value,lang='en'){
 if(value===null||value===undefined||value==='')return '—'
 if(typeof value==='number')return value.toLocaleString(lang==='ar'?'ar-SA':'en-US',{maximumFractionDigits:3})
 if(typeof value==='boolean')return lang==='ar'?(value?'نعم':'لا'):(value?'Yes':'No')
 if(typeof value==='object')return JSON.stringify(value)
 return String(value)
}
