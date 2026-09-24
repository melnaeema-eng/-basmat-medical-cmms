import {supabase} from './supabaseClient'
export async function loadSecurityReadiness(){
 const {data,error}=await supabase.rpc('bf32_security_readiness')
 if(error)throw error
 return data
}
