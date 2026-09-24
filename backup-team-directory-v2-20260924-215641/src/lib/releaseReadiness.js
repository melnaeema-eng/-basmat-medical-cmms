import {supabase} from './supabaseClient'
export async function loadReleaseReadiness(){
 const {data,error}=await supabase.rpc('bf33_release_readiness')
 if(error)throw error
 return data
}
