import CompanyField from '../components/CompanyField'
import {useEffect,useMemo,useRef,useState} from 'react'
import {Link,useLocation,useNavigate,useOutletContext} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadPPM,ppmAction,frequencies} from '../lib/ppm'
import {Field,Select,Dialog,Notice,Status,FormActions} from '../components/FacilityFields'
import DataTable from '../components/DataTable'
import {focusNextField} from '../lib/smartLanguage'
import GuidedDevicePPM from '../components/GuidedDevicePPM'
const blankProcedure={organization_id:'',name_ar:'',name_en:'',category_id:'',manufacturer:'',model:'',frequency:'monthly',reference:'',estimated_minutes:60}
const blankPlan={organization_id:'',asset_id:'',procedure_id:'',contract_id:'',start_date:'',interval_count:1}
const workflowSteps=[
 ['ppmGuideProcedure','ppmGuideProcedureHelp','procedures','ppmProcedures'],
 ['ppmGuideApprove','ppmGuideApproveHelp'],
 ['ppmGuidePlan','ppmGuidePlanHelp','plans','ppmPlans'],
 ['ppmGuideSchedule','ppmGuideScheduleHelp','jobs','ppmSchedule']
]
export default function PPM(){
 const {can}=useAuth(),{t,lang}=useLanguage(),navigate=useNavigate()
 const location=useLocation()
 const {companyId}=useOutletContext()
 const createForAsset=useLocation().state?.createForAsset
 const initializedAsset=useRef(null)
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [year,setYear]=useState(new Date().getFullYear()),[month,setMonth]=useState(0)
 const [tab,setTab]=useState('procedures'),[form,setForm]=useState(blankProcedure),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[filter,setFilter]=useState('')
 useEffect(()=>{
  if(new URLSearchParams(location.search).get('tab')!=='plans')return
  setTab('plans');setQuery('');setFilter('')
 },[location.key,location.search])
 const load=async()=>{setError('');try{setData(await loadPPM())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 const contextAsset=data?.assets.find(asset=>asset.id===createForAsset&&asset.organization_id===companyId)
 const contextAllowed=!!contextAsset&&can('ppm.manage',companyId)
 const assetReturn=createForAsset?'/medical-asset-cockpit?ppmAsset='+encodeURIComponent(createForAsset):null
 useEffect(()=>{
  if(!contextAllowed||initializedAsset.current===createForAsset)return
  initializedAsset.current=createForAsset
  setTab('procedures')
  const category=data.categories.find(row=>row.id===contextAsset.category_id&&row.organization_id===companyId)
  setForm({...blankProcedure,organization_id:companyId,category_id:category?.id||'',
   manufacturer:contextAsset.manufacturer||'',model:contextAsset.model||''})
  setOpen(true)
 },[contextAllowed,contextAsset,companyId,createForAsset,data])
 const closeForm=()=>{
  if(busy)return
  if(assetReturn)navigate(assetReturn)
  else setOpen(false)
 }
 const name=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const options=(rows,label)=>[{value:'',label:t('select')},...(rows||[]).map(x=>({value:x.id,label:label(x)}))]
 const procedures=data?.procedures||[],plans=data?.plans||[],jobs=data?.jobs||[]
 const norm=v=>(v||'').trim().toLowerCase()
 const matchRank=(p,a,org)=>{
  if(!a||p.organization_id!==org||p.status!=='approved')return -1
  if(p.category_id&&p.category_id!==a.category_id)return -1
  if(p.manufacturer&&norm(p.manufacturer)!==norm(a.manufacturer))return -1
  if(p.model&&norm(p.model)!==norm(a.model))return -1
  if(p.model)return 40
  if(p.manufacturer)return 30
  if(p.category_id)return 20
  return 10
 }
 const matchingProcedures=(assetId=form.asset_id,org=form.organization_id)=>{
  const a=data?.assets.find(x=>x.id===assetId)
  if(!a)return[]
  return procedures.map(p=>({p,rank:matchRank(p,a,org)})).filter(x=>x.rank>=0).sort((a,b)=>b.rank-a.rank||(Number(b.p.version||1)-Number(a.p.version||1))).map(x=>x.p)
 }
 const selectedAsset=data?.assets.find(a=>a.id===form.asset_id)
 const suggestedProcedures=matchingProcedures()
 const canSubmitPlan=suggestedProcedures.some(procedure=>procedure.id===form.procedure_id)
 const change=(key,value)=>setForm(f=>{
  if(key==='organization_id')return {...f,organization_id:value,asset_id:'',procedure_id:'',contract_id:'',category_id:''}
  if(key==='asset_id'){const matches=matchingProcedures(value,f.organization_id);return {...f,asset_id:value,procedure_id:matches[0]?.id||'',contract_id:''}}
  return {...f,[key]:value}
 })
 const rows=useMemo(()=>{
  if(tab==='device')return []
  const source=tab==='procedures'?procedures:tab==='plans'?plans:jobs
  return source.filter(x=>(tab!=='jobs'||(x.due_date?.startsWith(String(year))&&(!month||Number(x.due_date.slice(5,7))===month)))&&(!filter||x.status===filter)&&(!query||Object.values(x).some(v=>typeof v==='string'&&v.toLowerCase().includes(query.toLowerCase()))))
 },[data,tab,query,filter,year,month])
 const start=()=>{setForm(tab==='procedures'?blankProcedure:{...blankPlan,start_date:new Date().toISOString().slice(0,10)});setOpen(true);setError('')}
 const submit=async e=>{
  e.preventDefault();if(busy||(tab==='plans'&&!canSubmitPlan))return;setBusy(true);setError('')
  try{
   const kind=tab==='procedures'?'procedure':'plan'
   const id=await ppmAction(kind,null,'create',form)
   setOpen(false)
   navigate('/ppm/'+kind+'/'+id,{state:contextAllowed?{ppmAssetId:createForAsset}:null})
  }
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const run=async(kind,id,command,payload={})=>{
  if(!confirm(t('confirmAction')))return
  setBusy(true);setError('')
  try{await ppmAction(kind,id,command,payload);await load();setSuccess(t('saved'))}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const selectTab=next=>{setTab(next);setFilter('');setQuery('')}
 const openProcedureLibrary=()=>{setOpen(false);setError('');selectTab('procedures')}
 const canManage=can('ppm.manage')
 const columns=[
  {key:'code',label:t(tab==='jobs'?'jobNumber':tab==='plans'?'planCode':'procedureCode'),render:x=><Link to={'/ppm/'+(tab==='procedures'?'procedure':tab==='plans'?'plan':'job')+'/'+x.id}>{x.code||x.job_number}</Link>},
  {key:'name',label:t(tab==='procedures'?'procedure':tab==='plans'?'asset':'plan'),render:x=>tab==='procedures'?name(x):tab==='plans'?(data?.assets.find(a=>a.id===x.asset_id)?.asset_tag||'—'):(data?.plans.find(p=>p.id===x.plan_id)?.code||'—')},
  {key:'frequency',label:t(tab==='jobs'?'dueDate':'frequency'),render:x=>tab==='jobs'?x.due_date:t(x.frequency)},
  {key:'status',label:t('status'),render:x=><Status value={x.status}/>},
  {key:'actions',label:t('actions'),render:x=><div className="row-actions"><Link className="btn xs secondary" to={'/ppm/'+(tab==='procedures'?'procedure':tab==='plans'?'plan':'job')+'/'+x.id}>{t('details')}</Link>
   {tab==='plans'&&can('ppm.manage',x.organization_id)&&x.status==='draft'&&<button className="btn xs primary" disabled={busy} onClick={()=>run('plan',x.id,'activate')}>{t('activate')}</button>}
   </div>}
 ]
 const today=new Date().toISOString().slice(0,10)
 const annual=jobs.filter(j=>j.due_date?.startsWith(String(year)))
 return <section className="facility-module">
  <div className="page-head"><h1>{t('ppm')}</h1><div className="row-actions"><button className="btn secondary" onClick={load}>{t('refresh')}</button>{canManage&&['procedures','plans'].includes(tab)&&<button className="btn primary" onClick={start}>{t(tab==='procedures'?'newProcedure':'newPlan')}</button>}</div></div>
  <Notice error={open?'':error} success={success}/>
  <details className="facility-panel" open>
   <summary><strong>{t('ppmGuideTitle')}</strong></summary>
   <ol className="form-grid" style={{paddingInlineStart:24,marginBlockEnd:0}}>
    {workflowSteps.map(([title,help,key,label])=><li key={title}>
     <strong>{t(title)}</strong>
     <p className="muted">{t(help)}</p>
     {key&&tab!==key&&<button type="button" className="btn xs secondary" onClick={()=>selectTab(key)}>{t(label)}</button>}
    </li>)}
   </ol>
  </details>
  {assetReturn&&<Link to={assetReturn}>{lang==='ar'?'العودة إلى صيانة الجهاز':'Back to device maintenance'}</Link>}
  {data&&createForAsset&&!contextAllowed&&<p role="alert">{lang==='ar'?'يتطلب إنشاء الإجراء صلاحية إدارة الصيانة الوقائية للجهاز في الشركة الحالية.':'Creating this procedure requires preventive maintenance permission for the device in the current company.'}</p>}
  <div className="row-actions">
   <button className={'btn '+(tab==='device'?'primary':'secondary')} onClick={()=>selectTab('device')}>Device PPM | صيانة الجهاز</button>
   {[['procedures','ppmProcedures'],['plans','ppmPlans'],['jobs','ppmSchedule']].map(([key,label])=><button key={key} className={'btn '+(tab===key?'primary':'secondary')} onClick={()=>selectTab(key)}>{t(label)} ({(data?.[key]||[]).length})</button>)}
  </div>
  {tab==='jobs'&&<div className="facility-panel"><div className="filter-grid"><Field label={t('year')}><Select value={String(year)} onChange={v=>{setYear(Number(v));setMonth(0)}} options={[year-1,year,year+1].map(v=>({value:String(v),label:String(v)}))}/></Field><Field label={t('month')}><Select value={String(month)} onChange={v=>setMonth(Number(v))} options={[{value:'0',label:t('all')},...Array.from({length:12},(_,i)=>({value:String(i+1),label:new Date(2026,i,1).toLocaleString(lang,{month:'long'})}))]}/></Field></div><div className="stats-grid facility-stats">{Array.from({length:12},(_,i)=><button type="button" key={i} className={'stat-card '+(month===i+1?'active':'')} onClick={()=>setMonth(month===i+1?0:i+1)}><span>{new Date(2026,i,1).toLocaleString(lang,{month:'short'})}</span><strong>{annual.filter(j=>Number(j.due_date.slice(5,7))===i+1).length}</strong></button>)}</div></div>}
  {tab==='jobs'&&<div className="stats-grid facility-stats">{[['ppmJobs',annual.length],['scheduled',annual.filter(x=>x.status==='scheduled').length],['completed',annual.filter(x=>['completed','approved','closed'].includes(x.status)).length],['closed',annual.filter(x=>x.status==='closed').length]].map(([key,value])=><div className="stat-card" key={key}><span>{t(key)}</span><strong>{value}</strong></div>)}</div>}
  {tab==='device'&&data?<GuidedDevicePPM data={data} lang={lang}/>:<>
   <div className="facility-panel filter-grid"><Field label={t('search')}><input value={query} onChange={e=>setQuery(e.target.value)}/></Field><Field label={t('status')}><Select value={filter} onChange={setFilter} options={[{value:'',label:t('all')},...(tab==='procedures'?['draft','approved','archived']:tab==='plans'?['draft','active','paused','archived']:['scheduled','assigned','in_progress','completed','approved','closed','cancelled']).map(v=>({value:v,label:t(v)}))]}/></Field></div>
   {!data?<p>{t('loading')}</p>:<DataTable rows={rows} columns={columns} emptyText={t('noData')}/>}
  </>}
  {tab==='jobs'&&data&&<div className="facility-panel"><h3>{t('ppmSchedule')}</h3><div className="form-grid"><Field label={t('frequency')}><p>{t('scheduleNotice')}</p></Field><Field label={t('dueDate')}><p>{annual.length} {t('ppmJobs')}</p></Field></div></div>}
  <Dialog open={open} title={t(tab==='procedures'?'newProcedure':'newPlan')} onClose={closeForm}>
   <form className="facility-form" onSubmit={submit}>
   <Notice error={error}/>
   <div className="form-grid">
    {contextAllowed&&<p className="muted span-2">{t('asset')} · {contextAsset.asset_tag} · {name(contextAsset)}</p>}
    {!contextAllowed&&<CompanyField label={t('organization')} required><Select required value={form.organization_id} onChange={v=>change('organization_id',v)} options={options(data?.organizations.filter(x=>x.status==='active'&&can('ppm.manage',x.id)),name)}/></CompanyField>}
    {tab==='procedures'?<>
     {['name_ar','name_en'].map(key=><Field key={key} label={t(key==='name_ar'?'nameAr':'nameEn')} required><input name={key} required value={form[key]} onChange={e=>change(key,e.target.value)} onBlur={e=>e.target.value&&focusNextField(e.target)}/></Field>)}
     <Field label={t('category')}><Select value={form.category_id} onChange={v=>change('category_id',v)} options={options(data?.categories.filter(x=>x.organization_id===form.organization_id),name)}/></Field>
     {['manufacturer','model','reference'].map(key=><Field key={key} label={t(key)}><input value={form[key]} onChange={e=>change(key,e.target.value)}/></Field>)}
     <Field label={t('frequency')}><Select value={form.frequency} onChange={v=>change('frequency',v)} options={frequencies.map(v=>({value:v,label:t(v)}))}/></Field>
     <Field label={t('estimatedMinutes')}><input required type="number" min="1" value={form.estimated_minutes} onChange={e=>change('estimated_minutes',e.target.value)}/></Field>
     <p className="muted span-2">{t('procedureNotice')}</p>
    </>:<>
     <Field label={t('asset')} required><Select required value={form.asset_id} onChange={v=>change('asset_id',v)} options={options(data?.assets.filter(x=>x.organization_id===form.organization_id&&x.status==='active'),x=>x.asset_tag+' · '+name(x))}/></Field>
     <Field label={t('procedure')} required><Select required disabled={!suggestedProcedures.length} value={form.procedure_id} onChange={v=>change('procedure_id',v)} options={suggestedProcedures.map(x=>({value:x.id,label:x.code+' · '+name(x)+' · '+t(x.frequency)}))}/></Field>
     {selectedAsset&&!suggestedProcedures.length&&<div className="span-2">
      <p className="muted">{t('ppmProcedureMissing')}</p>
      <button type="button" className="btn secondary" onClick={openProcedureLibrary}>{t('ppmProcedures')}</button>
     </div>}
     <Field label={t('contractNumber')}><Select value={form.contract_id} onChange={v=>change('contract_id',v)} options={options(data?.contracts.filter(x=>x.organization_id===form.organization_id&&x.client_id===data?.assets.find(a=>a.id===form.asset_id)?.client_id),x=>x.contract_number)}/></Field>
     <Field label={t('startDate')} required><input type="date" required value={form.start_date} onChange={e=>change('start_date',e.target.value)}/></Field>
     <Field label={t('intervalCount')}><input type="number" min="1" max="100" value={form.interval_count} onChange={e=>change('interval_count',e.target.value)}/></Field>
     <p className="muted span-2">{t('planNotice')}</p>
    </>}
   </div><FormActions busy={busy} disabled={tab==='plans'&&!canSubmitPlan} onCancel={closeForm}/></form>
  </Dialog>
 </section>
}

