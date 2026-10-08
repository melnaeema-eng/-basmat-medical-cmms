import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {med2Catalog,med2SaveLocation} from '../lib/medicalCoreV2'

const kinds=[
 {key:'building',ar:'المباني',en:'Buildings',parent:null},
 {key:'floor',ar:'الطوابق',en:'Floors',parent:'building'},
 {key:'zone',ar:'المناطق',en:'Zones',parent:'floor'},
 {key:'room',ar:'الغرف',en:'Rooms',parent:'zone'}
]
const blank={name:'',code:'',level_no:'',parent_id:''}
function Field({label,children}){return <label style={{display:'grid',gap:6}}><span>{label}</span>{children}</label>}

export default function LocationManagement(){
 const {lang}=useLanguage(),ar=lang==='ar'
 const [data,setData]=useState({projects:[],sites:[],locations:[]})
 const [project,setProject]=useState(''),[site,setSite]=useState(''),[kind,setKind]=useState('building')
 const [open,setOpen]=useState(false),[form,setForm]=useState(blank)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[search,setSearch]=useState('')

 const reload=async()=>setData(await med2Catalog())
 useEffect(()=>{reload().catch(e=>setError(e.message))},[])

 const sites=useMemo(()=>data.sites.filter(s=>!project||s.project_id===project),[data.sites,project])
 const rows=useMemo(()=>data.locations.filter(x=>
   x.kind===kind&&(!project||x.project_id===project)&&(!site||x.site_id===site)&&
   (!search||`${x.name||''} ${x.code||''}`.toLowerCase().includes(search.toLowerCase()))
 ),[data.locations,kind,project,site,search])
 const current=kinds.find(x=>x.key===kind)
 const parents=useMemo(()=>{
  if(!current.parent)return []
  return data.locations.filter(x=>x.kind===current.parent&&x.project_id===project&&x.site_id===site)
 },[data.locations,current.parent,project,site])

 const start=()=>{setError('');setForm(blank);setOpen(true)}
 const save=async()=>{
  setBusy(true);setError('');setSuccess('')
  try{
   if(!project||!site)throw Error(ar?'اختر المشروع والموقع أولاً':'Select project and site first')
   if(!form.name.trim())throw Error(ar?'الاسم مطلوب':'Name required')
   if(current.parent&&!form.parent_id)throw Error(ar?'اختر المستوى الأعلى':'Select parent level')
   await med2SaveLocation({...form,kind,project_id:project,site_id:site})
   setOpen(false);setForm(blank);await reload()
   setSuccess(ar?'تمت الإضافة':'Added successfully')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{ar?'الهيكل المكاني':'Location Hierarchy'}</h1>
    <p className="muted">{ar?'المشروع ← الموقع ← المبنى ← الطابق ← المنطقة ← الغرفة':'Project → Site → Building → Floor → Zone → Room'}</p>
   </div>
   <div className="row-actions">
    <button className="btn secondary" onClick={()=>reload().catch(e=>setError(e.message))}>{ar?'تحديث':'Refresh'}</button>
    <button className="btn primary" onClick={start}>{ar?'+ إضافة':'+ Add'}</button>
   </div>
  </div>

  {error&&<div className="alert error">{error}</div>}
  {success&&<div className="alert success">{success}</div>}

  <div className="facility-panel filter-grid">
   <Field label={ar?'المشروع':'Project'}>
    <select value={project} onChange={e=>{setProject(e.target.value);setSite('')}}>
     <option value="">{ar?'اختر...':'Select...'}</option>
     {data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
   </Field>
   <Field label={ar?'المستشفى / الموقع':'Hospital / Site'}>
    <select value={site} onChange={e=>setSite(e.target.value)}>
     <option value="">{ar?'اختر...':'Select...'}</option>
     {sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </Field>
   <Field label={ar?'بحث':'Search'}><input value={search} onChange={e=>setSearch(e.target.value)}/></Field>
  </div>

  <div className="tabs">
   {kinds.map(k=><button key={k.key} className={kind===k.key?'active':''} onClick={()=>{setKind(k.key);setOpen(false)}}>
    {ar?k.ar:k.en}
   </button>)}
  </div>

  {open&&<div className="facility-panel">
   <h2>{ar?`إضافة ${current.ar}`:`Add ${current.en}`}</h2>
   <div className="form-grid">
    {current.parent&&<Field label={ar?'المستوى الأعلى':'Parent'}>
     <select value={form.parent_id} onChange={e=>setForm({...form,parent_id:e.target.value})}>
      <option value="">{ar?'اختر...':'Select...'}</option>
      {parents.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </Field>}
    <Field label={ar?'الاسم':'Name'}><input autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
    <Field label={ar?'الكود':'Code'}><input value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></Field>
    {kind==='floor'&&<Field label={ar?'رقم الطابق':'Floor number'}><input type="number" value={form.level_no} onChange={e=>setForm({...form,level_no:e.target.value})}/></Field>}
   </div>
   <div className="row-actions">
    <button className="btn primary" disabled={busy} onClick={save}>{ar?'حفظ':'Save'}</button>
    <button className="btn secondary" onClick={()=>setOpen(false)}>{ar?'إلغاء':'Cancel'}</button>
   </div>
  </div>}

  <div className="facility-panel">
   <table className="facility-table">
    <thead><tr><th>{ar?'الكود':'Code'}</th><th>{ar?'الاسم':'Name'}</th><th>{ar?'المستوى الأعلى':'Parent'}</th></tr></thead>
    <tbody>
     {rows.length===0?<tr><td colSpan="3">{ar?'لا توجد بيانات':'No data'}</td></tr>:
      rows.map(r=>{
       const p=data.locations.find(x=>x.id===r.parent_id)
       return <tr key={r.id}><td>{r.code||'—'}</td><td>{r.name}</td><td>{p?.name||'—'}</td></tr>
      })}
    </tbody>
   </table>
  </div>
 </section>
}
