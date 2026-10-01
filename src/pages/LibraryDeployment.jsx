import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMasterAssetLibrary,adoptMasterTemplates} from '../lib/masterAssetLibrary'
import {loadPPM,ppmAction} from '../lib/ppm'
import {Field,Notice} from '../components/FacilityFields'

const today=()=>new Date().toISOString().slice(0,10)

export default function LibraryDeployment(){
 const {access,can}=useAuth()
 const {lang}=useLanguage()
 const ar=lang==='ar'

 const [master,setMaster]=useState(null)
 const [ppm,setPpm]=useState(null)
 const [projects,setProjects]=useState([])
 const [projectSites,setProjectSites]=useState([])
 const [org,setOrg]=useState('')
 const [project,setProject]=useState('')
 const [site,setSite]=useState('')
 const [assetType,setAssetType]=useState('')
 const [manufacturer,setManufacturer]=useState('')
 const [query,setQuery]=useState('')
 const [asset,setAsset]=useState('')
 const [procedure,setProcedure]=useState('')
 const [startDate,setStartDate]=useState(today())
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')

 const refresh=async()=>{
  setError('')
  try{
   const [m,p]=await Promise.all([loadMasterAssetLibrary(),loadPPM()])
   setMaster(m);setPpm(p)

   const orgRows=(p?.organizations||[]).filter(x=>x.status!=='archived')
   const batches=await Promise.all(orgRows.map(async o=>{
    const {data,error}=await supabase.rpc('bf35_structure',{p_org:o.id})
    if(error)return[]
    return (data?.projects||[]).map(x=>({...x,organization_id:x.organization_id||o.id}))
   }))
   setProjects(batches.flat())

   const {data:ps,error:psError}=await supabase
    .from('bf35_project_sites')
    .select('project_id,organization_id,site_id,client_id')
   if(!psError)setProjectSites(ps||[])
  }catch(e){setError(e.message)}
 }

 useEffect(()=>{refresh()},[])

 const orgs=ppm?.organizations||[]
 const types=useMemo(()=>{
  const needle=query.trim().toLowerCase()
  return (master?.types||[]).filter(t=>{
   if(t.status==='archived')return false
   const opts=(master?.options||[]).filter(o=>o.asset_type_id===t.id)
   const models=opts.map(o=>o.model_family||'').join(' ')
   const brands=opts.map(o=>{
    const b=(master?.manufacturers||[]).find(m=>m.id===o.manufacturer_id)
    return b?.name||b?.short_name||''
   }).join(' ')
   const text=[t.code,t.name_ar,t.name_en,t.system_code,t.group_ar,t.group_en,models,brands].filter(Boolean).join(' ').toLowerCase()
   return !needle||text.includes(needle)
  })
 },[master,query])

 const options=useMemo(()=>(
  (master?.options||[]).filter(o=>
   (!assetType||o.asset_type_id===assetType)&&
   (!manufacturer||o.manufacturer_id===manufacturer)
  )
 ),[master,assetType,manufacturer])

 const manufacturers=useMemo(()=>{
  const ids=new Set((master?.options||[])
   .filter(o=>!assetType||o.asset_type_id===assetType)
   .map(o=>o.manufacturer_id))
  return (master?.manufacturers||[]).filter(m=>m.status!=='archived'&&ids.has(m.id))
 },[master,assetType])

 const templates=useMemo(()=>(
  (master?.templates||[]).filter(t=>
   t.status!=='archived' &&
   (!assetType||t.asset_type_id===assetType) &&
   (!manufacturer||!t.manufacturer_id||t.manufacturer_id===manufacturer)
  )
 ),[master,assetType,manufacturer])

 const orgProjects=projects.filter(p=>!org||p.organization_id===org)

 const mappedSiteIds=useMemo(()=>{
  if(!project)return null
  const ids=projectSites.filter(x=>x.project_id===project).map(x=>x.site_id)
  return new Set(ids)
 },[project,projectSites])

 const sites=(ppm?.sites||[]).filter(s=>
  (!org||s.organization_id===org) &&
  (!mappedSiteIds||mappedSiteIds.size===0||mappedSiteIds.has(s.id)) &&
  s.status!=='archived'
 )

 const assets=(ppm?.assets||[]).filter(a=>
  (!org||a.organization_id===org) &&
  (!site||a.site_id===site) &&
  a.status!=='archived'
 )

 const procedures=(ppm?.procedures||[]).filter(p=>
  (!org||p.organization_id===org) &&
  p.status!=='archived'
 )

 const selectedAsset=assets.find(x=>x.id===asset)
 const selectedSite=(ppm?.sites||[]).find(x=>x.id===site)

 const label=x=>ar?(x?.name_ar||x?.name_en||x?.name||x?.code):(x?.name_en||x?.name_ar||x?.name||x?.code)
 const procLabel=x=>`${label(x)}${x?.frequency?' · '+x.frequency:''}`

 const prepare=async()=>{
  if(!org||!assetType)return setError(ar?'اختر المنظمة ونوع الأصل أولاً':'Select organization and asset type first')
  try{
   setBusy(true);setError('');setSuccess('')
   const result=await adoptMasterTemplates(org,assetType,manufacturer||null)
   const updated=await loadPPM()
   setPpm(updated)
   setSuccess(ar
    ?`تم اعتماد قوالب المكتبة وإنشاء ${result?.procedures_created||0} إجراء PPM للمنظمة.`
    :`Library templates adopted; ${result?.procedures_created||0} PPM procedures created.`)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const createPlan=async()=>{
  if(!org||!asset||!procedure)return setError(ar?'اختر المنظمة والأصل وإجراء PPM':'Select organization, asset and PPM procedure')
  try{
   setBusy(true);setError('');setSuccess('')
   const contractId=selectedSite?.contract_id||''
   const id=await ppmAction('plan',null,'create',{
    organization_id:org,
    asset_id:asset,
    procedure_id:procedure,
    contract_id:contractId,
    start_date:startDate,
    interval_count:1
   })
   setPpm(await loadPPM())
   setSuccess(ar
    ?`تم إنشاء خطة PPM للأصل ${selectedAsset?.asset_tag||label(selectedAsset)} بنجاح.`
    :`PPM plan created for ${selectedAsset?.asset_tag||label(selectedAsset)}.`)
   return id
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 if(!master||!ppm)return <section className="facility-module"><p>{ar?'جاري تحميل المكتبة...':'Loading library...'}</p></section>

 return <section className="facility-module">
  <div className="page-head">
   <div>
    <h1>{ar?'تشغيل المكتبة على المشروع':'Deploy Library to Project'}</h1>
    <p className="muted">
     {ar
      ?'المكتبة ← المشروع ← الموقع ← الأصل ← PPM'
      :'Library → Project → Site → Asset → PPM'}
    </p>
   </div>
   <div className="row-actions">
    <button className="btn secondary" onClick={refresh} disabled={busy}>{ar?'تحديث':'Refresh'}</button>
    <Link className="btn" to="/asset-library">{ar?'المكتبة الرئيسية':'Master Library'}</Link>
    <Link className="btn" to="/ppm">{ar?'الصيانة الوقائية':'PPM'}</Link>
   </div>
  </div>

  <Notice error={error} success={success}/>

  <div className="facility-panel">
   <h2>{ar?'1. نطاق المشروع':'1. Project scope'}</h2>
   <div className="filter-grid">
    <Field label={ar?'المنظمة':'Organization'}>
     <select value={org} onChange={e=>{setOrg(e.target.value);setProject('');setSite('');setAsset('');setProcedure('')}}>
      <option value="">{ar?'اختر المنظمة':'Select organization'}</option>
      {orgs.map(o=><option key={o.id} value={o.id}>{o.name||o.code}</option>)}
     </select>
    </Field>
    <Field label={ar?'المشروع':'Project'}>
     <select value={project} onChange={e=>{setProject(e.target.value);setSite('');setAsset('')}} disabled={!org}>
      <option value="">{ar?'اختر المشروع':'Select project'}</option>
      {orgProjects.map(p=><option key={p.id||p.project_id} value={p.id||p.project_id}>{p.name||p.project_name||p.project_code}</option>)}
     </select>
    </Field>
    <Field label={ar?'الموقع':'Site'}>
     <select value={site} onChange={e=>{setSite(e.target.value);setAsset('')}} disabled={!org}>
      <option value="">{ar?'اختر الموقع':'Select site'}</option>
      {sites.map(s=><option key={s.id} value={s.id}>{s.name||s.code}</option>)}
     </select>
    </Field>
   </div>
  </div>

  <div className="facility-panel">
   <h2>{ar?'2. اختيار من المكتبة':'2. Select from library'}</h2>
   <div className="filter-grid">
    <Field label={ar?'بحث بالاسم / البراند / الموديل':'Search name / brand / model'}>
     <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ar?'مثال: AHU أو Siemens أو موديل':'e.g. AHU, Siemens, model'}/>
    </Field>
    <Field label={ar?'نوع الأصل':'Asset type'}>
     <select value={assetType} onChange={e=>{setAssetType(e.target.value);setManufacturer('')}}>
      <option value="">{ar?'اختر الأصل':'Select asset type'}</option>
      {types.map(t=><option key={t.id} value={t.id}>{t.icon_text||'🔧'} {label(t)}</option>)}
     </select>
    </Field>
    <Field label={ar?'العلامة التجارية':'Brand'}>
     <select value={manufacturer} onChange={e=>setManufacturer(e.target.value)} disabled={!assetType}>
      <option value="">{ar?'كل العلامات / OEM عام':'All brands / Generic OEM'}</option>
      {manufacturers.map(m=><option key={m.id} value={m.id}>{m.short_name||m.name}</option>)}
     </select>
    </Field>
   </div>

   {assetType&&<div style={{marginTop:12}}>
    <strong>{ar?'الموديلات المطابقة':'Matching models'}:</strong>{' '}
    {options.length
     ?options.slice(0,20).map(o=><span key={o.id} className="status-badge" style={{marginInlineEnd:6}}>{o.model_family||'—'}</span>)
     :<span className="muted">{ar?'لا يوجد موديل محدد؛ سيستخدم القالب العام.':'No model-specific entry; generic template will be used.'}</span>}
   </div>}

   {assetType&&<div style={{marginTop:12}}>
    <strong>{ar?'قوالب PPM المتاحة':'Available PPM templates'}:</strong>
    <div style={{display:'grid',gap:6,marginTop:6}}>
     {templates.map(t=><div key={t.id} style={{padding:'8px 10px',border:'1px solid #e5e7eb',borderRadius:8}}>
      <b>{ar?(t.title_ar||t.title_en):(t.title_en||t.title_ar)}</b>
      <span className="muted"> · {t.frequency} · {t.estimated_minutes||60} min</span>
     </div>)}
     {!templates.length&&<span className="muted">{ar?'لا يوجد قالب مطابق حتى الآن.':'No matching template yet.'}</span>}
    </div>
   </div>}

   <div className="row-actions" style={{marginTop:14}}>
    <button className="btn primary" onClick={prepare} disabled={busy||!org||!assetType||!can('ppm.manage',org)}>
     {ar?'اعتماد قوالب PPM للمشروع':'Prepare PPM procedures'}
    </button>
   </div>
  </div>

  <div className="facility-panel">
   <h2>{ar?'3. إنشاء خطة PPM للأصل الفعلي':'3. Create PPM plan for actual asset'}</h2>
   <div className="filter-grid">
    <Field label={ar?'الأصل بالموقع':'Site asset'}>
     <select value={asset} onChange={e=>setAsset(e.target.value)} disabled={!site}>
      <option value="">{ar?'اختر الأصل':'Select asset'}</option>
      {assets.map(a=><option key={a.id} value={a.id}>{a.asset_tag||'—'} · {label(a)} · {a.manufacturer||''} {a.model||''}</option>)}
     </select>
    </Field>
    <Field label={ar?'إجراء PPM':'PPM procedure'}>
     <select value={procedure} onChange={e=>setProcedure(e.target.value)} disabled={!org}>
      <option value="">{ar?'اختر الإجراء':'Select procedure'}</option>
      {procedures.map(p=><option key={p.id} value={p.id}>{procLabel(p)}</option>)}
     </select>
    </Field>
    <Field label={ar?'تاريخ البداية':'Start date'}>
     <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/>
    </Field>
   </div>
   <div className="row-actions" style={{marginTop:14}}>
    <button className="btn primary" onClick={createPlan} disabled={busy||!asset||!procedure||!can('ppm.manage',org)}>
     {ar?'إنشاء خطة PPM':'Create PPM plan'}
    </button>
   </div>
  </div>

  <div className="facility-panel">
   <h2>{ar?'4. شركات الصيانة':'4. Maintenance companies'}</h2>
   <p className="muted">
    {ar
     ?'تبقى شركات صيانة المرافق وشركات صيانة الأجهزة الطبية مكتبتين مستقلتين، ويتم ربط كل شركة بالمشروع والموقع من موديولها.'
     :'Facilities and medical maintenance-company libraries remain separate and are linked to project/site from their own modules.'}
   </p>
   <div className="row-actions">
    <Link className="btn" to='/medical-service-library'>
     {ar?'فتح مكتبة شركات الصيانة':'Open maintenance companies library'}
    </Link>
   </div>
  </div>
 </section>
}

