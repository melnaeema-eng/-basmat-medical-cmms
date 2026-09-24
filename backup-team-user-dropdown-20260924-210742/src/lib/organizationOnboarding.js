import {supabase} from './supabaseClient'
export async function loadOrganizations(){
 const {data,error}=await supabase.rpc('bf36_organization_directory')
 if(error)throw error
 return data||[]
}
export async function createOrganization(v){
 const {data,error}=await supabase.rpc('bf36_create_organization',{
  p_name_ar:v.name_ar||'',p_name_en:v.name_en||'',p_type:v.organization_type,
  p_registration_no:v.registration_no||null,p_vat_no:v.vat_no||null,
  p_email:v.email||null,p_phone:v.phone||null,p_city:v.city||null,p_address:v.address||null
 })
 if(error)throw error
 return data
}
export async function updateOrganization(v){
 const {error}=await supabase.rpc('bf36_update_organization',{
  p_org:v.id,p_name_ar:v.name_ar||'',p_name_en:v.name_en||'',p_type:v.organization_type,
  p_registration_no:v.registration_no||null,p_vat_no:v.vat_no||null,
  p_email:v.email||null,p_phone:v.phone||null,p_city:v.city||null,p_address:v.address||null
 })
 if(error)throw error
}
