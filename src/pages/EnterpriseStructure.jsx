import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {
 med2Catalog,med2SaveOrganization,med2SaveProject,med2SaveSite,med2SaveTeam
} from '../lib/medicalCoreV2'

const blankProject={owner_org_id:'',maintenance_org_id:'',consultant_org_id:'',name:'',start_date:'',end_date:''}
const blankSite={name:'',city:'',address:'',latitude:'',longitude:''}
const orgName=x=>x?.name_ar||x?.name||x?.name_en||x?.code||'—'

function Card({title,children}){return <div className="facility-panel"><h2>{title}</h2>{children}</div>}
function Field({label,children}){return <label style={{display:'grid',gap:6}}><span>{label}</span>{children}</label>}

export default function EnterpriseStructure(){
 const {lang}=useLanguage(),ar=lang==='ar'
 const [data,setData]=useState({organizations:[],projects:[],sites:[],users:[],roles:[]})
 const [project,setProject]=useState(blankProject)
 const [selectedProject,setSelectedProject]=useState('')
 const [site,setSite]=useState(blankSite)
 const [team,setTeam]=useState({user_id:'',role_id:'',site_id:''})
 const [newOrg,setNewOrg]=useState({role:'',name:''})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')

 const reload=async()=>setData(await med2Catalog())
 useEffect(()=>{reload().catch(e=>setError(e.message))},[])

 const projectSites=useMemo(()=>data.sites.filter(x=>x.project_id===selectedProject),[data.sites,selectedProject])

 const run=async fn=>{
  setBusy(true);setError('');setSuccess('')
  try{await fn();await reload();setSuccess(ar?'تم الحفظ بنجاح':'Saved successfully')}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const addOrg=()=>run(async()=>{
  if(!newOrg.name.trim())throw Error(ar?'اكتب اسم الجهة':'Enter organization name')
  const id=await med2SaveOrganization(newOrg.name.trim())
  setProject(p=>({...p,[newOrg.role]:id}))
  setNewOrg({role:'',name:''})
 })

 const saveProject=()=>run(async()=>{
  if(!project.owner_org_id||!project.maintenance_org_id||!project.name.trim())throw Error(ar?'المالك وشركة الصيانة واسم المشروع مطلوبة':'Owner, maintenance company and project name are required')
  const id=await med2SaveProject(project)
  setSelectedProject(id)
  setProject(blankProject)
 })

 const saveSite=()=>run(async()=>{
  if(!selectedProject)throw Error(ar?'اختر المشروع أولاً':'Select project first')
  if(!site.name.trim())throw Error(ar?'اسم الموقع مطلوب':'Site name required')
  const id=await med2SaveSite({...site,project_id:selectedProject})
  setTeam(t=>({...t,site_id:id}))
  setSite(blankSite)
 })

 const saveTeam=()=>run(async()=>{
  if(!selectedProject||!team.user_id||!team.role_id)throw Error(ar?'اختر المشروع والمستخدم والدور':'Select project, user and role')
  await med2SaveTeam({...team,project_id:selectedProject})
  setTeam({user_id:'',role_id:'',site_id:''})
 })

 const orgSelect=(key,label)=><div style={{display:'grid',gap:8}}>
  <Field label={label}>
   <select value={project[key]} onChange={e=>setProject({...project,[key]:e.target.value})}>
    <option value="">{ar?'اختر...':'Select...'}</option>
    {data.organizations.map(o=><option key={o.id} value={o.id}>{orgName(o)}</option>)}
   </select>
  </Field>
  <button type="button" className="btn secondary" onClick={()=>setNewOrg({role:key,name:''})}>
   {ar?'+ إضافة جهة جديدة':'+ Add organization'}
  </button>
 </div>

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{ar?'إعداد المشروع — النواة الجديدة':'Project Setup — New Core'}</h1>
    <p className="muted">{ar?'المالك ← شركة الصيانة ← الاستشاري ← المشروع ← الموقع ← الفريق':'Owner → Maintenance Company → Consultant → Project → Site → Team'}</p>
   </div>
  </div>
  {error&&<div className="alert error">{error}</div>}
  {success&&<div className="alert success">{success}</div>}

  {newOrg.role&&<Card title={ar?'إضافة جهة':'Add organization'}>
   <div className="form-grid">
    <Field label={ar?'اسم الجهة':'Organization name'}><input autoFocus value={newOrg.name} onChange={e=>setNewOrg({...newOrg,name:e.target.value})}/></Field>
   </div>
   <div className="row-actions">
    <button className="btn primary" disabled={busy} onClick={addOrg}>{ar?'حفظ':'Save'}</button>
    <button className="btn secondary" onClick={()=>setNewOrg({role:'',name:''})}>{ar?'إلغاء':'Cancel'}</button>
   </div>
  </Card>}

  <Card title={ar?'1. الجهات والمشروع':'1. Parties & Project'}>
   <div className="form-grid">
    {orgSelect('owner_org_id',ar?'المالك':'Owner')}
    {orgSelect('maintenance_org_id',ar?'شركة الصيانة':'Maintenance Company')}
    {orgSelect('consultant_org_id',ar?'الاستشاري':'Consultant')}
    <Field label={ar?'اسم المشروع':'Project name'}><input value={project.name} onChange={e=>setProject({...project,name:e.target.value})}/></Field>
    <Field label={ar?'تاريخ البداية':'Start date'}><input type="date" value={project.start_date} onChange={e=>setProject({...project,start_date:e.target.value})}/></Field>
    <Field label={ar?'تاريخ النهاية':'End date'}><input type="date" value={project.end_date} onChange={e=>setProject({...project,end_date:e.target.value})}/></Field>
   </div>
   <button className="btn primary" disabled={busy} onClick={saveProject}>{ar?'حفظ المشروع':'Save Project'}</button>
  </Card>

  <Card title={ar?'2. المشروع الحالي':'2. Current Project'}>
   <Field label={ar?'المشروع':'Project'}>
    <select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}>
     <option value="">{ar?'اختر...':'Select...'}</option>
     {data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
   </Field>
  </Card>

  <Card title={ar?'3. المستشفى / الموقع':'3. Hospital / Site'}>
   <div className="form-grid">
    <Field label={ar?'اسم الموقع':'Site name'}><input value={site.name} onChange={e=>setSite({...site,name:e.target.value})}/></Field>
    <Field label={ar?'المدينة':'City'}><input value={site.city} onChange={e=>setSite({...site,city:e.target.value})}/></Field>
    <Field label={ar?'العنوان':'Address'}><input value={site.address} onChange={e=>setSite({...site,address:e.target.value})}/></Field>
    <Field label="Latitude"><input type="number" step="any" value={site.latitude} onChange={e=>setSite({...site,latitude:e.target.value})}/></Field>
    <Field label="Longitude"><input type="number" step="any" value={site.longitude} onChange={e=>setSite({...site,longitude:e.target.value})}/></Field>
   </div>
   <button className="btn primary" disabled={busy||!selectedProject} onClick={saveSite}>{ar?'+ إضافة موقع':'+ Add Site'}</button>
  </Card>

  <Card title={ar?'4. فريق المشروع':'4. Project Team'}>
   <div className="form-grid">
    <Field label={ar?'المستخدم':'User'}>
     <select value={team.user_id} onChange={e=>setTeam({...team,user_id:e.target.value})}>
      <option value="">{ar?'اختر...':'Select...'}</option>
      {data.users.map(u=><option key={u.id} value={u.id}>{u.full_name||u.email}</option>)}
     </select>
    </Field>
    <Field label={ar?'الدور':'Role'}>
     <select value={team.role_id} onChange={e=>setTeam({...team,role_id:e.target.value})}>
      <option value="">{ar?'اختر...':'Select...'}</option>
      {data.roles.map(r=><option key={r.id} value={r.id}>{r.name||r.code}</option>)}
     </select>
    </Field>
    <Field label={ar?'الموقع (اختياري)':'Site (optional)'}>
     <select value={team.site_id} onChange={e=>setTeam({...team,site_id:e.target.value})}>
      <option value="">{ar?'كل المشروع':'Whole project'}</option>
      {projectSites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </Field>
   </div>
   <button className="btn primary" disabled={busy||!selectedProject} onClick={saveTeam}>{ar?'+ إضافة عضو':'Add Member'}</button>
  </Card>
 </section>
}
