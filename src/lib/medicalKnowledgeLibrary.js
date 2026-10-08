import {supabase} from './supabaseClient'

export async function medicalLibrarySearch(query){
 const {data,error}=await supabase.rpc('bf_med_company_library_search',{p_query:query})
 if(error)throw error
 return data||[]
}

export async function medicalCompanySmartLookup(name){
 const {data,error}=await supabase.functions.invoke('medical-company-smart-lookup',{body:{name}})
 if(error)throw error
 return data||{}
}

export async function medicalLibrarySave(v){
 const {data,error}=await supabase.rpc('bf_med_company_library_save',{
  p_id:v.id||null,
  p_name_ar:v.name_ar||null,
  p_name_en:v.name_en||null,
  p_company_type:v.company_type||'maintenance_company',
  p_website:v.website||null,
  p_registration_no:v.registration_no||null,
  p_vat_no:v.vat_no||null,
  p_email:v.email||null,
  p_phone:v.phone||null,
  p_city:v.city||null,
  p_address:v.address||null,
  p_logo_url:v.logo_url||null,
  p_logo_source:v.logo_source||null,
  p_specialties:v.specialties||[],
  p_manufacturers:v.manufacturers||[],
  p_notes:v.notes||null,
  p_source_type:v.source_type||'manual',
  p_source_reference:v.source_reference||null,
  p_confidence:v.confidence??null
 })
 if(error)throw error
 return data
}

export async function createOrLinkMedicalTenant(library_company_id){
 const {data,error}=await supabase.rpc('bf_med_create_or_link_tenant_from_library',{p_library_company:library_company_id})
 if(error)throw error
 return data
}

export async function medRelationshipBundle(organization_id){
 const {data,error}=await supabase.rpc('bf_med_relationship_bundle',{p_org:organization_id})
 if(error)throw error
 return data||{clients:[],sites:[],projects:[],assets:[]}
}
