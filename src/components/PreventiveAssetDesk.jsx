import {useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {Field, Select, Status} from './FacilityFields'
import DataTable from './DataTable'
import './PreventiveAssetDesk.css'

export default function PreventiveAssetDesk({data, companyId, assetId, onAsset, canPlan, matchingProcedures, onCreatePlan}){
 const {t,lang}=useLanguage()
 const [query,setQuery]=useState('')
 const [coverage,setCoverage]=useState('')
 const [limit,setLimit]=useState(25)
 const L=(ar,en)=>lang==='ar'?ar:en
 const name=row=>lang==='ar'?row?.name_ar||row?.name_en:row?.name_en||row?.name_ar
 const assets=data.assets.filter(row=>row.status==='active'&&(!companyId||row.organization_id===companyId))
 const asset=assets.find(row=>row.id===assetId)
 const procedureById=new Map(data.procedures.map(row=>[row.id,row]))
 const plansByAsset=new Map()
 for(const row of data.plans){
  if(row.status==='archived')continue
  if(!plansByAsset.has(row.asset_id))plansByAsset.set(row.asset_id,[])
  plansByAsset.get(row.asset_id).push(row)
 }
 const assetPlans=asset?(plansByAsset.get(asset.id)||[]).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')):[]
 const matches=asset?matchingProcedures(asset.id,asset.organization_id):[]
 const existingProcedures=new Set(assetPlans.map(row=>row.procedure_id))
 const available=matches.filter(row=>!existingProcedures.has(row.id))
 const planIds=new Set(assetPlans.map(row=>row.id))
 const jobs=data.jobs.filter(row=>planIds.has(row.plan_id)).sort((a,b)=>a.due_date.localeCompare(b.due_date))
 const jobsByPlan=new Set(jobs.filter(row=>row.status!=='cancelled').map(row=>row.plan_id))
 const upcoming=jobs.filter(row=>['scheduled','assigned','in_progress'].includes(row.status))
 const unplanned=assets.filter(row=>!plansByAsset.has(row.id)).length
 const visible=assets.filter(row=>{
  if(coverage==='unplanned'&&plansByAsset.has(row.id))return false
  const term=query.trim().toLowerCase()
  return !term||[row.asset_tag,row.name_ar,row.name_en,row.serial_number,row.manufacturer,row.model].some(value=>value?.toLowerCase().includes(term))
 }).sort((a,b)=>a.asset_tag.localeCompare(b.asset_tag,undefined,{numeric:true}))
 const columns=[
  {key:'asset',label:t('asset'),render:row=><button type="button" className="btn xs secondary" onClick={()=>onAsset(row.id)}>{name(row)} · <bdi>{row.asset_tag}</bdi></button>},
  {key:'plans',label:t('ppmPlans'),render:row=>plansByAsset.get(row.id)?.length||L('بدون خطة','No plan')},
  {key:'model',label:t('model'),render:row=>[row.manufacturer,row.model].filter(Boolean).join(' · ')||'—'}
 ]
 const next=(plan,procedure)=>{
  if(plan.status==='active')return jobsByPlan.has(plan.id)?L('متابعة الجدول','View schedule'):t('generate')
  if(!procedure)return L('مراجعة الإجراء المرتبط','Review linked procedure')
  if(procedure.status!=='approved')return L('إكمال الإجراء واعتماده','Complete and approve procedure')
  return t('activate')
 }
 return <div className="ppm-desk">
  {asset&&<section className="facility-panel ppm-asset-summary" aria-label={t('asset')}>
   <div className="ppm-desk-header">
    <div><h2>{name(asset)} <bdi>{asset.asset_tag}</bdi></h2><p className="muted">{[name(data.categories.find(row=>row.id===asset.category_id)),asset.manufacturer,asset.model].filter(Boolean).join(' · ')}</p></div>
    <div className="row-actions">
     <button className="btn secondary" type="button" onClick={()=>onAsset('')}>{L('تغيير المعدة','Change asset')}</button>
     {canPlan(asset)&&<button className="btn primary" type="button" onClick={()=>onCreatePlan(asset,available.length===1?available[0].id:'')}>{assetPlans.length?L('إضافة خطة أخرى','Add another plan'):t('newPlan')}</button>}
    </div>
   </div>
   {assetPlans.length>0&&<div className="ppm-desk-list" aria-label={t('ppmPlans')}>
    {assetPlans.map(plan=>{
     const procedure=procedureById.get(plan.procedure_id)
     const review=procedure&&procedure.status!=='approved'&&['draft','paused'].includes(plan.status)
     return <div key={plan.id} className="ppm-desk-line">
      <div><Link to={'/ppm/plan/'+plan.id}>{plan.code}</Link><p>{name(procedure)||'—'} · {t(plan.frequency)}</p></div>
      <Status value={plan.status}/>
      <Link className="btn xs secondary" to={review?'/ppm/procedure/'+procedure.id:'/ppm/plan/'+plan.id}
       state={review?{linkedPlanId:plan.id}:undefined}>{next(plan,procedure)}</Link>
     </div>
    })}
   </div>}
   {!assetPlans.length&&<p>{L('هذه المعدة بدون خطة صيانة وقائية.','This asset has no preventive maintenance plan.')}</p>}
   {upcoming.length>0&&<div className="ppm-desk-list">
    <h3>{L('المهام المفتوحة','Open tasks')}</h3>
    {upcoming.slice(0,5).map(job=><div key={job.id} className="ppm-desk-line">
     <Link to={'/ppm/job/'+job.id}>{job.job_number}</Link><bdi>{job.due_date}</bdi><Status value={job.status}/>
    </div>)}
   </div>}
  </section>}
  {!asset&&<section className="facility-panel">
   <div className="ppm-desk-header"><h2>{L('اختر معدة','Choose an asset')}</h2><span className="muted">{unplanned} {L('معدة بدون خطة','assets without a plan')}</span></div>
   <div className="filter-grid">
    <Field label={L('اسم المعدة أو رقمها','Asset name or tag')}><input value={query} onChange={e=>{setQuery(e.target.value);setLimit(25)}}/></Field>
    <Field label={L('تغطية الصيانة','Maintenance coverage')}><Select value={coverage} placeholder={t('all')} onChange={value=>{setCoverage(value);setLimit(25)}} options={[{value:'unplanned',label:L('بدون خطة','No plan')}]}/></Field>
   </div>
   <DataTable rows={visible.slice(0,limit)} columns={columns} emptyText={t('noData')}/>
   {visible.length>limit&&<button type="button" className="btn secondary" onClick={()=>setLimit(value=>value+25)}>{L('عرض المزيد','Show more')}</button>}
  </section>}
 </div>
}
