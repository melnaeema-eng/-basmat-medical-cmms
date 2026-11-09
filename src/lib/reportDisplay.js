const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const readable=value=>typeof value==='string'&&value.trim()&&!uuid.test(value.trim())?value.trim():null
const name=row=>readable(row?.name)||readable(row?.name_ar)||readable(row?.name_en)
// Reads only references contained in the already-authorized report; all reads retain RLS.
export async function resolveReportReferences(report,organizationId,client){
 if(!report||!organizationId||!report.rows?.length)return report
 const rows=report.rows
 const specs=[
  {table:'bf_clients',fields:'id,name',keys:['client_id','owner_client_id'],scoped:true},
  {table:'bf_sites',fields:'id,name',keys:['site_id'],scoped:true},
  {table:'bf_assets',fields:'id,asset_tag,name_ar,name_en',keys:['asset_id'],scoped:true},
  {table:'bf9_visits',fields:'id,visit_number',keys:['visit_id'],scoped:true},
  {table:'bf_profiles',fields:'id,full_name',keys:['assigned_to','technician_id'],scoped:false},
  {table:'bf_work_orders',fields:'id,work_order_number',keys:['work_order_id'],scoped:true}
 ]
 const maps={},failures=[]
 await Promise.all(specs.map(async spec=>{
  const ids=[...new Set(rows.flatMap(r=>spec.keys.map(k=>r[k])).filter(v=>typeof v==='string'&&uuid.test(v)))]
  maps[spec.table]=new Map()
  for(let i=0;i<ids.length;i+=200){
   try{
    let q=client.from(spec.table).select(spec.fields).in('id',ids.slice(i,i+200))
    if(spec.scoped)q=q.eq('organization_id',organizationId)
    const {data,error}=await q
    if(error)throw error
    for(const item of data||[])maps[spec.table].set(item.id,item)
   }catch{failures.push(spec.table)}
  }
 }))
 const record=(table,id)=>maps[table]?.get(id)
 return {...report,reference_lookup_unavailable:failures.length>0,rows:rows.map(row=>{
  const asset=record('bf_assets',row.asset_id)
  return {...row,
   owner_name:readable(row.owner_name)||name(record('bf_clients',row.client_id)),
   site_name:readable(row.site_name)||name(record('bf_sites',row.site_id)),
   asset_name:readable(row.asset_name)||[readable(asset?.asset_tag),name(asset)].filter(Boolean).join(' — ')||null,
   visit_number:readable(row.visit_number)||readable(record('bf9_visits',row.visit_id)?.visit_number),
   assigned_technician_name:readable(row.assigned_technician_name)||readable(record('bf_profiles',row.assigned_to)?.full_name),
   stock_owner_name:readable(row.stock_owner_name)||name(record('bf_clients',row.owner_client_id)),
   work_order_number:readable(row.work_order_number)||readable(record('bf_work_orders',row.work_order_id)?.work_order_number),
   full_name:readable(row.full_name)||readable(record('bf_profiles',row.technician_id)?.full_name)
  }
 })}
}
export function displayReportValue(value,column,lang='en'){
 if(value===null||value===undefined||value==='')return '—'
 if(typeof value==='string'&&(/(_at|_date)$/.test(column)||column==='due_date')&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)){
  const date=new Date(value)
  if(!Number.isNaN(date.getTime())){
   const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value)
   return new Intl.DateTimeFormat(lang==='ar'?'ar-SA-u-ca-gregory-nu-latn':'en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',...dateOnly?{}:{hour:'2-digit',minute:'2-digit',hour12:false}}).format(date)
  }
 }
 return value
}
export function prepareReportDisplay(report,columns,lang='en'){
 return {...report,generated_at:displayReportValue(report.generated_at,'generated_at',lang),filters:{...report.filters,start_date:displayReportValue(report.filters?.start_date,'start_date',lang),end_date:displayReportValue(report.filters?.end_date,'end_date',lang)},rows:(report.rows||[]).map(row=>({...row,...Object.fromEntries(columns.map(c=>[c,displayReportValue(row[c],c,lang)]))}))}
}
