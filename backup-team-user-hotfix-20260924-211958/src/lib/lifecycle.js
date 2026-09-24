import {supabase} from './supabaseClient'
export async function loadLifecycle(org=null){const {data,error}=await supabase.rpc('bf14_center',{p_org:org,p_limit:500});if(error)throw error;return data}
export async function inspectAsset(v){const {data,error}=await supabase.rpc('bf14_inspect',{p_asset:v.asset_id,p_condition:v.condition,p_operational_status:v.operational_status,p_score:v.score?Number(v.score):null,p_notes:v.notes||'',p_next:v.next_inspection_date||null});if(error)throw error;return data}
export async function createClaim(v){const {data,error}=await supabase.rpc('bf14_claim',{p_action:'create',p_id:null,p_data:v});if(error)throw error;return data}
export async function updateClaim(id,status,resolution=''){const {data,error}=await supabase.rpc('bf14_claim',{p_action:'status',p_id:id,p_data:{status,resolution}});if(error)throw error;return data}
export async function savePlan(v){const {error}=await supabase.rpc('bf14_plan',{p_asset:v.asset_id,p_target:v.target_date||null,p_priority:v.priority,p_reason:v.reason||'',p_cost:v.estimated_cost?Number(v.estimated_cost):null,p_currency:v.currency||'SAR',p_status:v.status});if(error)throw error}
