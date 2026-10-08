import {supabase} from './supabaseClient'
import {ppmAction} from './ppm'

const today=()=>new Date().toISOString().slice(0,10)
const addMonths=(date,months)=>{
  const d=new Date(date||today())
  d.setMonth(d.getMonth()+Number(months||12))
  return d.toISOString().slice(0,10)
}

export async function loadMedicalAssetCockpit(assetId){
  if(!assetId)return null
  const {data,error}=await supabase.rpc('bf_med_asset_operational_context',{p_asset:assetId})
  if(error)throw error
  return data
}

export async function searchMedicalAssets(query=''){
  const {data,error}=await supabase
    .from('bf_med_asset_service_overview')
    .select('*')
    .order('asset_tag',{ascending:true})
    .limit(2000)

  if(error)throw error
  const rows=data||[]
  const needle=String(query||'').trim().toLowerCase()
  if(!needle)return rows

  return rows.filter(x=>[
    x.asset_tag,x.asset_type_ar,x.asset_type_en,x.serial_number,
    x.manufacturer_name,x.model,x.location_code,x.location_name_ar,
    x.location_name_en,x.location_path,x.maintenance_company_name,
    x.contract_number
  ].filter(Boolean).join(' ').toLowerCase().includes(needle))
}

export async function loadAssetActionData(asset){
  if(!asset?.asset_id)return {procedures:[],jobs:[],requests:[],workOrders:[],staff:[]}

  const [p,j,r,w,s]=await Promise.all([
    supabase.from('bf_ppm_procedures').select('*')
      .eq('organization_id',asset.organization_id)
      .eq('status','approved')
      .order('name_en',{ascending:true}),
    supabase.from('bf_ppm_jobs').select('*')
      .eq('asset_id',asset.asset_id)
      .order('due_date',{ascending:false})
      .limit(100),
    supabase.from('bf_service_requests').select('*')
      .eq('asset_id',asset.asset_id)
      .order('reported_at',{ascending:false})
      .limit(100),
    supabase.from('bf_work_orders').select('*')
      .eq('asset_id',asset.asset_id)
      .order('created_at',{ascending:false})
      .limit(100),
    supabase.rpc('bf5_staff_directory')
  ])

  for(const x of [p,j,r,w])if(x.error)throw x.error

  const all=p.data||[]
  const compatible=all.filter(proc=>{
    if(proc.category_id && asset.category_id && String(proc.category_id)!==String(asset.category_id))return false
    if(proc.manufacturer && String(proc.manufacturer).trim() &&
       String(proc.manufacturer).trim().toLowerCase()!==String(asset.manufacturer_name||'').trim().toLowerCase())return false
    if(proc.model && String(proc.model).trim() &&
       String(proc.model).trim().toLowerCase()!==String(asset.model||'').trim().toLowerCase())return false
    return true
  })

  return {
    procedures:compatible,
    allProcedures:all,
    jobs:j.data||[],
    requests:r.data||[],
    workOrders:w.data||[],
    staff:s.error?[]:(s.data||[])
  }
}

export async function createAssetPPM({asset,procedureId,startDate,horizonMonths=12,contractId=null}){
  if(!asset?.asset_id)throw Error('Select asset first')
  if(!procedureId)throw Error('Select approved PPM procedure')

  const planId=await ppmAction('plan',null,'create',{
    organization_id:asset.organization_id,
    asset_id:asset.asset_id,
    procedure_id:procedureId,
    start_date:startDate||today(),
    contract_id:contractId||asset.contract_id||null,
    interval_count:1
  })

  await ppmAction('plan',planId,'activate',{})
  await ppmAction('plan',planId,'generate',{
    through_date:addMonths(startDate||today(),horizonMonths)
  })

  const {data,error}=await supabase
    .from('bf_ppm_jobs')
    .select('*')
    .eq('plan_id',planId)
    .order('due_date',{ascending:true})

  if(error)throw error
  return {planId,jobs:data||[]}
}

export async function assignPPMJob(jobId,userId){
  if(!jobId||!userId)throw Error('Select PPM job and technician')
  return ppmAction('job',jobId,'assign',{user_id:userId})
}

export async function createFaultRequest({asset,title,description,priority='P3'}){
  const {data,error}=await supabase.rpc('bf4_action',{
    p_kind:'request',
    p_id:null,
    p_action:'create',
    p_data:{
      organization_id:asset.organization_id,
      client_id:asset.client_id,
      site_id:asset.site_id,
      contract_id:asset.contract_id||null,
      asset_id:asset.asset_id,
      title,
      description:description||'',
      priority
    }
  })
  if(error)throw error
  return data
}

export async function convertRequestToWorkOrder(requestId){
  const {data,error}=await supabase.rpc('bf4_action',{
    p_kind:'request',
    p_id:requestId,
    p_action:'convert',
    p_data:{}
  })
  if(error)throw error
  return data
}

export async function createDirectWorkOrder({asset,title,description,priority='P3'}){
  const {data,error}=await supabase.rpc('bf4_action',{
    p_kind:'work_order',
    p_id:null,
    p_action:'create',
    p_data:{
      organization_id:asset.organization_id,
      client_id:asset.client_id,
      site_id:asset.site_id,
      contract_id:asset.contract_id||null,
      asset_id:asset.asset_id,
      title,
      description:description||'',
      priority
    }
  })
  if(error)throw error
  return data
}

export async function loadMedicalSpareUsage(assetId){
  if(!assetId)return []
  const candidates=[
    ['bf_inv_movements','asset_id'],
    ['bf7_stock_moves','asset_id'],
    ['bf_inv_requests','asset_id']
  ]
  for(const [table,key] of candidates){
    const {data,error}=await supabase.from(table).select('*').eq(key,assetId).limit(100)
    if(!error)return data||[]
  }
  return []
}

