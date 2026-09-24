import {supabase} from './supabaseClient'
export async function loadCosting(org=null){const {data,error}=await supabase.rpc('bf15_center',{p_org:org,p_limit:200});if(error)throw error;return data}
export async function saveRate(v){const {error}=await supabase.rpc('bf15_save_rate',{p_org:v.organization_id,p_technician:v.technician_id,p_rate:Number(v.hourly_rate),p_currency:v.currency||'SAR',p_from:v.effective_from,p_to:v.effective_to||null});if(error)throw error}
export async function addCost(v){const {error}=await supabase.rpc('bf15_add_cost',{p_work_order:v.work_order_id,p_type:v.cost_type,p_description:v.description,p_amount:Number(v.amount),p_currency:v.currency||'SAR',p_date:v.cost_date||null});if(error)throw error}
export async function voidCost(id,reason){const {error}=await supabase.rpc('bf15_void_cost',{p_id:id,p_reason:reason});if(error)throw error}
