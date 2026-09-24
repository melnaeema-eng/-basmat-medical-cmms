import {supabase} from './supabaseClient'

export async function loadPermitDashboard(f={}){
 const {data,error}=await supabase.rpc('bf24_dashboard',{
  p_org:f.organization_id||null,
  p_status:f.status||null,
  p_limit:f.limit||300
 })
 if(error)throw error
 return data
}

export async function createPermit(v){
 const {data,error}=await supabase.rpc('bf24_create',{
  p_site:v.site_id,
  p_work_order:v.work_order_id||null,
  p_asset:v.asset_id||null,
  p_type:v.permit_type,
  p_title:v.title,
  p_description:v.description||'',
  p_risk:v.risk_level,
  p_valid_from:new Date(v.valid_from).toISOString(),
  p_valid_to:new Date(v.valid_to).toISOString()
 })
 if(error)throw error
 return data
}

export async function loadPermitDetail(id){
 const {data,error}=await supabase.rpc('bf24_detail',{p_permit:id})
 if(error)throw error
 return data
}

export async function addPermitControl(v){
 const {data,error}=await supabase.rpc('bf24_add_control',{
  p_permit:v.permit_id,p_type:v.control_type,p_description:v.description,p_mandatory:v.mandatory
 })
 if(error)throw error
 return data
}

export async function verifyPermitControl(id,note=''){
 const {error}=await supabase.rpc('bf24_verify_control',{p_control:id,p_note:note})
 if(error)throw error
}

export async function permitAction(id,action,reason=null){
 const {error}=await supabase.rpc('bf24_action',{p_permit:id,p_action:action,p_reason:reason})
 if(error)throw error
}
