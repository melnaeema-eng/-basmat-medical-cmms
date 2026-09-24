import {supabase} from './supabaseClient'

export async function loadCompliance(f={}){
 const {data,error}=await supabase.rpc('bf23_dashboard',{
  p_org:f.organization_id||null,
  p_client:f.client_id||null,
  p_limit:f.limit||300
 })
 if(error)throw error
 return data
}

export async function createComplianceObligation(v){
 const {data,error}=await supabase.rpc('bf23_create_obligation',{
  p_scope_type:v.scope_type,
  p_site:v.site_id,
  p_asset:v.scope_type==='asset'?v.asset_id:null,
  p_title:v.title,
  p_authority:v.authority||'',
  p_category:v.category,
  p_severity:v.severity,
  p_frequency_months:v.frequency_months?Number(v.frequency_months):null,
  p_next_due:v.next_due_date,
  p_notes:v.notes||''
 })
 if(error)throw error
 return data
}

export async function recordComplianceResult(v){
 const {data,error}=await supabase.rpc('bf23_record_result',{
  p_obligation:v.obligation_id,
  p_result:v.result,
  p_completed_at:new Date(v.completed_at).toISOString(),
  p_certificate_number:v.certificate_number||null,
  p_evidence_reference:v.evidence_reference||null,
  p_valid_until:v.valid_until||null,
  p_notes:v.notes||''
 })
 if(error)throw error
 return data
}

export async function archiveComplianceObligation(id,reason){
 const {error}=await supabase.rpc('bf23_archive_obligation',{p_obligation:id,p_reason:reason})
 if(error)throw error
}
