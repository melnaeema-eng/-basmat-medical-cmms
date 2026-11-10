import {supabase} from './supabaseClient'
import {ownerLogoSource} from './ownerLogo'

export async function loadOwnerIdentity(scope={},db=supabase){
 let {organizationId,clientId,contractId,assetId,workOrderId,ppmJobId,siteId}=scope
 const one=async(table,id,columns)=>{
  if(!id)return null
  let query=db.from(table).select(columns).eq('id',id)
  if(organizationId)query=query.eq('organization_id',organizationId)
  const {data,error}=await query.maybeSingle()
  if(error)throw error
  return data
 }
 const adopt=row=>{
  if(!row)return false
  if(organizationId&&row.organization_id!==organizationId)return false
  if(clientId&&row.client_id&&row.client_id!==clientId)return false
  organizationId=organizationId||row.organization_id
  clientId=clientId||row.client_id
  siteId=siteId||row.site_id
  assetId=assetId||row.asset_id
  contractId=contractId||row.contract_id
  return true
 }
 if(workOrderId&&!adopt(await one('bf_work_orders',workOrderId,'id,organization_id,client_id,site_id,asset_id,contract_id')))return null
 if(ppmJobId&&!adopt(await one('bf_ppm_jobs',ppmJobId,'id,organization_id,client_id,site_id,asset_id')))return null
 if(assetId&&!adopt(await one('bf_assets',assetId,'id,organization_id,client_id,site_id')))return null
 if(siteId&&!adopt(await one('bf_sites',siteId,'id,organization_id,client_id,contract_id')))return null
 if(contractId&&!adopt(await one('bf_contracts',contractId,'id,organization_id,client_id')))return null
 if(!organizationId||!clientId)return null
 const owner=await one('bf_clients',clientId,'id,organization_id,name,logo_url')
 if(!owner)return null
 let logo=ownerLogoSource(owner.logo_url)
 if(!logo&&contractId){
  const {data}=await db.from('bf_owner_report_branding').select('owner_logo_data').eq('organization_id',organizationId).eq('contract_id',contractId).maybeSingle()
  logo=ownerLogoSource(data?.owner_logo_data)
 }
 return {id:owner.id,organization_id:organizationId,name:owner.name,logo_url:logo}
}
