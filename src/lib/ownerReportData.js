import {ownerReportModel} from './ownerReportModel.js'
const ASSET_REPORT_COLUMNS='id,organization_id,client_id,site_id,asset_tag,name_ar,name_en,serial_number,manufacturer,model,status,operational_status,criticality,warranty_end'

export async function ownerReportRows(client,table,filters=[],columns='*'){
 const rows=[]
 for(let offset=0;offset<20000;offset+=500){
  let q=client.from(table).select(columns).order('id').range(offset,offset+499)
  for(const [key,value] of filters)if(value!==''&&value!=null)q=q.eq(key,value)
  const {data,error}=await q
  if(error)throw error
  rows.push(...(data||[]))
  if((data||[]).length<500)return rows
 }
 throw Error('Too many records. Narrow the report scope before generating it.')
}
const nameOf=(row,lang='en')=>row?(lang==='ar'?(row.name_ar||row.name||row.name_en||row.code):(row.name_en||row.name||row.name_ar||row.code)):'—'

export async function readOwnerReportData(db,{contractId,organizationId,clientId,start,end,lang='en',reportType='monthly'}){
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z')
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||(b-a)/86400000>366)throw Error(lang==='ar'?'اختر فترة صحيحة لا تتجاوز سنة.':'Select a valid period of at most one year.')
 let contract=null
 if(contractId){
  const {data,error}=await db.from('bf_contracts').select('id,organization_id,client_id,contract_number').eq('id',contractId).single()
  if(error)throw error
  contract=data
  if(organizationId&&contract.organization_id!==organizationId)throw Error(lang==='ar'?'العقد لا يتبع الشركة المختارة.':'The contract does not belong to the selected company.')
  organizationId=contract.organization_id;clientId=contract.client_id
 }
 if(!organizationId||!clientId)throw Error(lang==='ar'?'اختر الشركة والمالك أو عقداً محدداً.':'Select a company and owner, or a specific contract.')
 const base=[['organization_id',organizationId],['client_id',clientId]]
 const [organization,client,ownerSites,workOrders,ppmJobs,ownerAssets]=await Promise.all([
  ownerReportRows(db,'bf_organizations',[['id',organizationId]]).then(x=>x[0]||null),
  ownerReportRows(db,'bf_clients',[['id',clientId],['organization_id',organizationId]]).then(x=>x[0]||null),
  ownerReportRows(db,'bf_sites',base),
  ownerReportRows(db,'bf_work_orders',[...base,...contractId?[['contract_id',contractId]]:[]]),
  ownerReportRows(db,'bf_ppm_jobs',[...base,...contractId?[['bf_ppm_plans.contract_id',contractId]]:[]],contractId?'*,bf_ppm_plans!inner(contract_id)':'*'),
  ownerReportRows(db,'bf_assets',base,ASSET_REPORT_COLUMNS)
 ])
 const referencedSites=new Set([...workOrders,...ppmJobs].map(r=>r.site_id))
 const referencedAssets=new Set([...workOrders,...ppmJobs].map(r=>r.asset_id))
 const sites=contractId?ownerSites.filter(r=>r.contract_id===contractId||referencedSites.has(r.id)):ownerSites
 const contractedSites=new Set(ownerSites.filter(r=>r.contract_id===contractId).map(r=>r.id))
 const assets=contractId?ownerAssets.filter(r=>referencedAssets.has(r.id)||contractedSites.has(r.site_id)):ownerAssets
 const model=ownerReportModel({workOrders,ppmJobs,assets,sites,start,end,reportType,lang})
 return {...model,contract,organization,client,scope:contractId?'contract':'owner',labels:{organization:nameOf(organization,lang),client:nameOf(client,lang),contract:contract?.contract_number||(lang==='ar'?'جميع عقود المالك والأعمال غير المرتبطة بعقد':'All owner contracts and work without a contract')}}
}
