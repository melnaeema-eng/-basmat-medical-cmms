import {supabase} from './supabaseClient'
export async function loadGovernance(){
 const {data,error}=await supabase.rpc('bf38_role_matrix')
 if(error)throw error
 return data||{roles:[],permission_anomalies:[],scope_anomalies:[],summary:{}}
}
export async function repairGovernanceViews(){
 const {data,error}=await supabase.rpc('bf38_repair_missing_views')
 if(error)throw error
 return data||0
}
