import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {medRelationshipBundle} from '../lib/medicalKnowledgeLibrary'
import {
 loadExistingMedicalMasters,linkExistingMedicalOwner,createMedicalOwner,
 createMedicalProject,linkExistingMedicalProject,
 createMedicalSite,linkExistingMedicalSite
} from '../lib/medicalRelationshipManager'

export default function MedicalCompanyRelationships({tenant,onChanged}){
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const org=tenant?.organization_id

 const [masters,setMasters]=useState({clients:[],projects:[],sites:[]})
 const [bundle,setBundle]=useState({clients:[],projects:[],sites:[],assets:[]})
 const [ownerMode,setOwnerMode]=useState('existing')
 const [projectMode,setProjectMode]=useState('existing')
 const [siteMode,setSiteMode]=useState('existing')

 const [ownerId,setOwnerId]=useState('')
 const [projectId,setProjectId]=useState('')
 const [siteId,setSiteId]=useState('')

 const [newOwner,setNewOwner]=useState({name:'',code:'',email:'',phone:''})
 const [newProject,setNewProject]=useState({name:'',start_date:'',end_date:''})
 const [newSite,setNewSite]=useState({name:'',code:'',city:'',address:''})

 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [ok,setOk]=useState('')

 const refresh=async()=>{
  if(!org)return
  const [m,b]=await Promise.all([
   loadExistingMedicalMasters(org),
   medRelationshipBundle(org)
  ])
  setMasters(m)
  setBundle(b)
 }

 useEffect(()=>{refresh().catch(e=>setError(e.message))},[org])

 const ownerName=id=>masters.clients.find(x=>x.id===id)?.name||bundle.clients?.find(x=>x.id===id)?.name||id||'—'
 const projectName=id=>masters.projects.find(x=>x.id===id)?.name||masters.projects.find(x=>x.id===id)?.project_name||id||'—'

 const doOwner=async()=>{
  setBusy(true);setError('');setOk('')
  try{
   let id=ownerId
   if(ownerMode==='new'){
    if(!newOwner.name.trim())throw new Error(ar?'اسم المالك مطلوب':'Owner name required')
    const x=await createMedicalOwner({organization_id:org,...newOwner})
    id=x.id
    setNewOwner({name:'',code:'',email:'',phone:''})
   }else{
    if(!id)throw new Error(ar?'اختر المالك':'Select owner')
    await linkExistingMedicalOwner(org,id)
   }
   setOwnerId(id)
   setProjectId('')
   setSiteId('')
   await refresh()
   setOk(ar?'تم ربط المالك':'Owner linked')
   onChanged?.()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const doProject=async()=>{
  setBusy(true);setError('');setOk('')
  try{
   if(!ownerId)throw new Error(ar?'اربط المالك أولاً':'Link owner first')
   let id=projectId
   if(projectMode==='new'){
    if(!newProject.name.trim())throw new Error(ar?'اسم المشروع مطلوب':'Project name required')
    const x=await createMedicalProject({organization_id:org,client_id:ownerId,...newProject})
    id=x.id
    setNewProject({name:'',start_date:'',end_date:''})
   }else{
    if(!id)throw new Error(ar?'اختر المشروع':'Select project')
    await linkExistingMedicalProject(org,ownerId,id)
   }
   setProjectId(id)
   setSiteId('')
   await refresh()
   setOk(ar?'تم ربط المشروع':'Project linked')
   onChanged?.()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const doSite=async()=>{
  setBusy(true);setError('');setOk('')
  try{
   if(!ownerId)throw new Error(ar?'اربط المالك أولاً':'Link owner first')
   if(!projectId)throw new Error(ar?'اربط المشروع أولاً':'Link project first')
   let id=siteId
   if(siteMode==='new'){
    if(!newSite.name.trim())throw new Error(ar?'اسم المستشفى/المركز مطلوب':'Hospital/center name required')
    const x=await createMedicalSite({
     organization_id:org,client_id:ownerId,project_id:projectId,...newSite
    })
    id=x.id
    setNewSite({name:'',code:'',city:'',address:''})
   }else{
    if(!id)throw new Error(ar?'اختر المستشفى/المركز':'Select hospital/center')
    await linkExistingMedicalSite({
     organization_id:org,client_id:ownerId,project_id:projectId,site_id:id
    })
   }
   setSiteId(id)
   await refresh()
   setOk(ar?'تم ربط المستشفى/المركز':'Hospital/center linked')
   onChanged?.()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 if(!org)return null

 return <div className="facility-panel" style={{marginTop:16}}>
  <div className="page-head">
   <div>
    <h2>{ar?'ربط الشركة بالمالك والمشروع والمستشفى/المركز':'Company Relationships'}</h2>
    <p className="muted">{ar?'كل إضافة أو ربط يظهر مباشرة أسفل الشركة':'Every add/link appears immediately below the company'}</p>
   </div>
   <button className="btn secondary" onClick={()=>refresh().catch(e=>setError(e.message))}>{ar?'تحديث':'Refresh'}</button>
  </div>

  {error&&<div className="alert error">{error}</div>}
  {ok&&<div className="alert success">{ok}</div>}

  <div className="facility-panel">
   <h3>{ar?'1. المالك / العميل':'1. Owner / Client'}</h3>
   <div className="form-actions">
    <button type="button" className={'btn '+(ownerMode==='existing'?'primary':'secondary')} onClick={()=>setOwnerMode('existing')}>{ar?'اختيار موجود':'Use Existing'}</button>
    <button type="button" className={'btn '+(ownerMode==='new'?'primary':'secondary')} onClick={()=>setOwnerMode('new')}>{ar?'إضافة جديد':'Add New'}</button>
   </div>
   {ownerMode==='existing'
    ?<label>{ar?'المالك':'Owner'}<select value={ownerId} onChange={e=>{setOwnerId(e.target.value);setProjectId('');setSiteId('')}}><option value="">{ar?'اختر':'Select'}</option>{masters.clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    :<div className="form-grid">
      <label>{ar?'اسم المالك':'Owner name'}<input value={newOwner.name} onChange={e=>setNewOwner(v=>({...v,name:e.target.value}))}/></label>
      <label>{ar?'الكود':'Code'}<input value={newOwner.code} onChange={e=>setNewOwner(v=>({...v,code:e.target.value}))}/></label>
      <label>{ar?'البريد':'Email'}<input value={newOwner.email} onChange={e=>setNewOwner(v=>({...v,email:e.target.value}))}/></label>
      <label>{ar?'الهاتف':'Phone'}<input value={newOwner.phone} onChange={e=>setNewOwner(v=>({...v,phone:e.target.value}))}/></label>
     </div>}
   <div className="form-actions"><button className="btn primary" disabled={busy} onClick={doOwner}>{ar?'ربط المالك':'Link Owner'}</button></div>
  </div>

  <div className="facility-panel">
   <h3>{ar?'2. المشروع':'2. Project'}</h3>
   <div className="form-actions">
    <button type="button" className={'btn '+(projectMode==='existing'?'primary':'secondary')} onClick={()=>setProjectMode('existing')}>{ar?'اختيار موجود':'Use Existing'}</button>
    <button type="button" className={'btn '+(projectMode==='new'?'primary':'secondary')} onClick={()=>setProjectMode('new')}>{ar?'إنشاء جديد':'Add New'}</button>
   </div>
   {projectMode==='existing'
    ?<label>{ar?'المشروع':'Project'}<select value={projectId} onChange={e=>{setProjectId(e.target.value);setSiteId('')}}><option value="">{ar?'اختر':'Select'}</option>{masters.projects.map(x=><option key={x.id} value={x.id}>{x.name||x.project_name||x.id}</option>)}</select></label>
    :<div className="form-grid">
      <label>{ar?'اسم المشروع':'Project name'}<input value={newProject.name} onChange={e=>setNewProject(v=>({...v,name:e.target.value}))}/></label>
      <label>{ar?'تاريخ البداية':'Start date'}<input type="date" value={newProject.start_date} onChange={e=>setNewProject(v=>({...v,start_date:e.target.value}))}/></label>
      <label>{ar?'تاريخ النهاية':'End date'}<input type="date" value={newProject.end_date} onChange={e=>setNewProject(v=>({...v,end_date:e.target.value}))}/></label>
     </div>}
   <div className="form-actions"><button className="btn primary" disabled={busy||!ownerId} onClick={doProject}>{ar?'ربط المشروع':'Link Project'}</button></div>
  </div>

  <div className="facility-panel">
   <h3>{ar?'3. المستشفى / المركز':'3. Hospital / Center'}</h3>
   <div className="form-actions">
    <button type="button" className={'btn '+(siteMode==='existing'?'primary':'secondary')} onClick={()=>setSiteMode('existing')}>{ar?'اختيار موجود':'Use Existing'}</button>
    <button type="button" className={'btn '+(siteMode==='new'?'primary':'secondary')} onClick={()=>setSiteMode('new')}>{ar?'إضافة جديد':'Add New'}</button>
   </div>
   {siteMode==='existing'
    ?<label>{ar?'المستشفى/المركز':'Hospital/Center'}<select value={siteId} onChange={e=>setSiteId(e.target.value)}><option value="">{ar?'اختر':'Select'}</option>{masters.sites.filter(x=>!ownerId||x.client_id===ownerId).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    :<div className="form-grid">
      <label>{ar?'الاسم':'Name'}<input value={newSite.name} onChange={e=>setNewSite(v=>({...v,name:e.target.value}))}/></label>
      <label>{ar?'الكود':'Code'}<input value={newSite.code} onChange={e=>setNewSite(v=>({...v,code:e.target.value}))}/></label>
      <label>{ar?'المدينة':'City'}<input value={newSite.city} onChange={e=>setNewSite(v=>({...v,city:e.target.value}))}/></label>
      <label className="span-2">{ar?'العنوان':'Address'}<input value={newSite.address} onChange={e=>setNewSite(v=>({...v,address:e.target.value}))}/></label>
     </div>}
   <div className="form-actions"><button className="btn primary" disabled={busy||!ownerId||!projectId} onClick={doSite}>{ar?'ربط المستشفى/المركز':'Link Hospital/Center'}</button></div>
  </div>

  <div className="facility-panel">
   <h3>{ar?'العلاقات الحالية':'Current Relationships'}</h3>
   <div className="security-check-list">
    {(bundle.clients||[]).map(c=><article key={'c-'+c.id} className="facility-panel"><strong>{ar?'مالك: ':'Owner: '}{c.name}</strong></article>)}
    {(bundle.projects||[]).map(p=><article key={'p-'+p.project_id} className="facility-panel"><strong>{ar?'مشروع: ':'Project: '}{projectName(p.project_id)}</strong><div className="muted">{ar?'المالك: ':'Owner: '}{ownerName(p.client_id)}</div></article>)}
    {(bundle.sites||[]).map(s=><article key={'s-'+s.id} className="facility-panel"><strong>{ar?'مستشفى/مركز: ':'Hospital/Center: '}{s.name}</strong><div className="muted">{ar?'المشروع: ':'Project: '}{projectName(s.project_id)}</div></article>)}
   </div>
  </div>
 </div>
}
