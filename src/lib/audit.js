import {supabase} from './supabaseClient'
export async function loadAudit(f={}){
 const {data,error}=await supabase.rpc('bf17_audit_feed',{
  p_org:f.organization_id||null,p_source:f.source||null,
  p_from:f.from?new Date(f.from+'T00:00:00').toISOString():null,
  p_to:f.to?new Date(f.to+'T23:59:59.999').toISOString():null,
  p_limit:f.limit||200,p_offset:f.offset||0
 })
 if(error)throw error
 return data
}
