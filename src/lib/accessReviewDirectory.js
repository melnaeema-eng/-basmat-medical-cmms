import {supabase} from './supabaseClient'

export async function loadAccessReviewDirectory(orgId){
  const {data,error}=await supabase.rpc('bf39_directory',{p_org:orgId})
  if(error) throw error
  return data||{users:[],roles:[],scopes:[]}
}
