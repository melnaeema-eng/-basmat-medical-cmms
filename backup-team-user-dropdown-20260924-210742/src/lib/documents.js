import {supabase} from './supabaseClient'
export async function loadDocuments(filters={}){
 const {data,error}=await supabase.rpc('bf13_center',{
  p_org:filters.organization_id||null,p_client:filters.client_id||null,p_type:filters.document_type||null,
  p_limit:filters.limit||100,p_offset:filters.offset||0})
 if(error)throw error
 return data
}
export async function generateDocument(type,entityType,entityId,title=''){
 const {data,error}=await supabase.rpc('bf13_generate',{p_type:type,p_entity_type:entityType,p_entity:entityId,p_title:title||null})
 if(error)throw error
 return data
}
export async function voidDocument(id,reason){
 const {error}=await supabase.rpc('bf13_void',{p_id:id,p_reason:reason})
 if(error)throw error
}
