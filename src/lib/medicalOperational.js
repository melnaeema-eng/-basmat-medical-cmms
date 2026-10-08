import {supabase} from './supabaseClient'

export async function medRegisterTenant(organization_id){
 const {error}=await supabase.rpc('bf_med_register_tenant_company',{p_org:organization_id})
 if(error)throw error
}
export async function medLinkClient(organization_id,client_id){
 const {error}=await supabase.rpc('bf_med_link_client',{p_org:organization_id,p_client:client_id})
 if(error)throw error
}
export async function medLinkSite(organization_id,client_id,site_id){
 const {error}=await supabase.rpc('bf_med_link_site',{p_org:organization_id,p_client:client_id,p_site:site_id})
 if(error)throw error
}
export async function medLinkAsset(organization_id,client_id,site_id,asset_id){
 const {error}=await supabase.rpc('bf_med_link_asset',{
  p_org:organization_id,p_client:client_id,p_site:site_id,p_asset:asset_id
 })
 if(error)throw error
}
export async function medOperationalDirectory(organization_id){
 const {data,error}=await supabase.rpc('bf_med_operational_directory',{p_org:organization_id})
 if(error)throw error
 return data||{tenant:{},clients:[],sites:[],assets:[]}
}
export async function medCreateOwnerReport(v){
 const {data,error}=await supabase.rpc('bf_med_owner_report_create',{
  p_org:v.organization_id,p_client:v.client_id,p_site:v.site_id,p_asset:v.asset_id,
  p_complaint:v.complaint,p_priority:v.priority||'P3'
 })
 if(error)throw error
 return data
}
export async function medCreateInternalWorkOrder(v){
 const {data,error}=await supabase.rpc('bf_med_internal_work_order_create',{
  p_org:v.organization_id,p_client:v.client_id||null,p_site:v.site_id||null,p_asset:v.asset_id,
  p_title:v.title,p_description:v.description||null,p_priority:v.priority||'P3',
  p_source_type:v.source_type||'INTERNAL',p_maintenance_type:v.maintenance_type||'corrective'
 })
 if(error)throw error
 return data
}
export async function medSaveStepResult(v){
 const {data,error}=await supabase.rpc('bf_med_wo_step_result_save',{
  p_work_order:v.work_order_id,p_step_order:v.step_order,p_step_title:v.step_title,
  p_result_status:v.result_status,p_instruction:v.instruction||null,
  p_response_type:v.response_type||'pass_fail',p_reading_value:v.reading_value||null,
  p_reading_text:v.reading_text||null,p_unit:v.unit||null,p_notes:v.notes||null,
  p_evidence_url:v.evidence_url||null,p_corrective_required:!!v.corrective_required
 })
 if(error)throw error
 return data
}
export async function medCaptureReportBrandSnapshot(v){
 const {data,error}=await supabase.rpc('bf_med_capture_report_brand_snapshot',{
  p_org:v.organization_id,p_client:v.client_id||null,p_site:v.site_id||null,
  p_work_order:v.work_order_id||null,p_report_type:v.report_type||'service_report'
 })
 if(error)throw error
 return data
}
