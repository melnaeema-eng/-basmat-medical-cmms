import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {
 loadProjectSetupCatalog,loadProjectSetupUsers,addProjectSetupReference,
 createSetupProject,linkSetupSite,assignSetupUser
} from '../lib/projectSetupV1'

const blank={
 organization_id:'',name:'',start_date:'',end_date:'',
 client_id:'',contract_id:'',site_id:''
}
const emptyNew={organization:'',client:'',contract:'',site:''}
const label=(x,ar)=>ar?(x.name_ar||x.name||x.name_en||x.code||x.contract_number):(x.name_en||x.name||x.name_ar||x.code||x.contract_number)

function AddPanel({open,ar,busy,onSave,onCancel,children}){
 if(!open)return null
 return <div className="facility-panel" style={{marginTop:10}}>
  {children}
  <div style={{display:'flex',gap:8,marginTop:10}}>
   <button className="btn primary" type="button" disabled={busy} onClick={onSave}>
    {ar?'حفظ وإدراج':'Save & insert'}
   </button>
   <button className="btn secondary" type="button" onClick={onCancel}>
    {ar?'إلغاء':'Cancel'}
   </button>
  </div>
 </div>
}

function StepPanel({active,n,title,onOpen,ar,children}){
 return <section className="facility-panel" style={{opacity:active?1:.72,border:active?'2px solid var(--primary, #2563eb)':undefined}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
   <h2 style={{margin:0}}>{n}. {title}</h2>
   {!active&&<button type="button" className="btn secondary" onClick={onOpen}>{ar?'فتح':'Open'}</button>}
  </div>
  {active&&<div style={{marginTop:14}}>{children}</div>}
 </section>
}

export default function EnterpriseStructure(){
 const {lang}=useLanguage(), ar=lang==='ar'
 const [cat,setCat]=useState({organizations:[],clients:[],contracts:[],sites:[],roles:[]})
 const [users,setUsers]=useState([])
 const [form,setForm]=useState(blank)
 const [newOpen,setNewOpen]=useState(emptyNew)
 const [newData,setNewData]=useState({})
 const [team,setTeam]=useState([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [step,setStep]=useState(1)

 const refresh=async()=>{
   const x=await loadProjectSetupCatalog()
   setCat(x)
   return x
 }

 useEffect(()=>{refresh().catch(e=>setError(e.message))},[])

 useEffect(()=>{
   if(!form.organization_id){setUsers([]);return}
   loadProjectSetupUsers(form.organization_id).then(setUsers).catch(e=>setError(e.message))
 },[form.organization_id])

 const clients=useMemo(()=>cat.clients.filter(x=>x.organization_id===form.organization_id),[cat.clients,form.organization_id])
 const contracts=useMemo(()=>cat.contracts.filter(x=>x.organization_id===form.organization_id&&(!form.client_id||x.client_id===form.client_id)),[cat.contracts,form.organization_id,form.client_id])
 const sites=useMemo(()=>cat.sites.filter(x=>x.organization_id===form.organization_id&&(!form.client_id||x.client_id===form.client_id)),[cat.sites,form.organization_id,form.client_id])
 const roles=useMemo(()=>cat.roles.filter(x=>!x.organization_id||x.organization_id===form.organization_id),[cat.roles,form.organization_id])

 const set=(k,v)=>setForm(f=>{
   const n={...f,[k]:v}
   if(k==='organization_id'){n.client_id='';n.contract_id='';n.site_id=''}
   if(k==='client_id'){n.contract_id='';n.site_id=''}
   return n
 })

 const toggleAdd=k=>setNewOpen(o=>({...o,[k]:o[k]?'':k}))
 const nd=(k,v)=>setNewData(x=>({...x,[k]:v}))

 const useCurrentLocation=()=>{
   setError('')
   if(!navigator.geolocation){
     setError(ar?'المتصفح لا يدعم تحديد الموقع.':'Geolocation is not supported by this browser.')
     return
   }
   navigator.geolocation.getCurrentPosition(
     p=>{
       nd('site_latitude',String(p.coords.latitude))
       nd('site_longitude',String(p.coords.longitude))
     },
     e=>setError(ar?'تعذر الحصول على الموقع الحالي: '+e.message:'Unable to get current location: '+e.message),
     {enableHighAccuracy:true,timeout:15000,maximumAge:0}
   )
 }

 const addRef=async(kind)=>{
   setBusy(true);setError('');setSuccess('')
   try{
     let payload={}
     if(kind==='organization') payload={name:newData.organization_name}
     if(kind==='client') payload={
       organization_id:form.organization_id,
       name:newData.client_name,
       email:newData.client_email||null,
       phone:newData.client_phone||null
     }
     if(kind==='contract') payload={
       organization_id:form.organization_id,
       client_id:form.client_id,
       contract_number:newData.contract_number||null,
       contract_type:newData.contract_type||null,
       start_date:newData.contract_start||null,
       end_date:newData.contract_end||null,
       contract_value:newData.contract_value||null
     }
     if(kind==='site'){
       if(!newData.site_latitude||!newData.site_longitude){
         throw Error(ar?'الموقع الجغرافي مطلوب للمستشفى / الموقع النشط.':'Geographic coordinates are required for an active site.')
       }
       payload={
         organization_id:form.organization_id,
         client_id:form.client_id,
         contract_id:form.contract_id||null,
         name:newData.site_name,
         city:newData.site_city||null,
         address:newData.site_address||null,
         latitude:newData.site_latitude,
         longitude:newData.site_longitude
       }
     }

     const saved=await addProjectSetupReference(kind,payload)
     await refresh()

     if(kind==='organization')set('organization_id',saved.id)
     if(kind==='client')set('client_id',saved.id)
     if(kind==='contract')set('contract_id',saved.id)
     if(kind==='site')set('site_id',saved.id)

     setNewOpen(o=>({...o,[kind]:''}))
     setSuccess(ar?'تمت الإضافة وتحديث القائمة فوراً.':'Added and list updated immediately.')
   }catch(e){
     setError(e.message)
   }finally{
     setBusy(false)
   }
 }

 const addTeamRow=()=>setTeam(t=>[...t,{user_id:'',role_id:'',site_id:form.site_id||''}])
 const updateTeam=(i,k,v)=>setTeam(t=>t.map((x,n)=>n===i?{...x,[k]:v}:x))
 const removeTeam=i=>setTeam(t=>t.filter((_,n)=>n!==i))

 const saveAll=async()=>{
   if(!form.organization_id||!form.name||!form.client_id){
     setError(ar?'شركة الصيانة واسم المشروع والمالك مطلوبة.':'Maintenance company, project name and owner are required.')
     return
   }

   setBusy(true);setError('');setSuccess('')
   try{
     const projectId=await createSetupProject(form)
     if(!projectId)throw Error('Project ID was not returned')

     if(form.site_id)await linkSetupSite(projectId,form.site_id)

     for(const row of team){
       if(row.user_id&&row.role_id){
         await assignSetupUser({...row,organization_id:form.organization_id,project_id:projectId})
       }
     }

     setSuccess(ar?'تم حفظ وإعداد المشروع بنجاح.':'Project setup saved successfully.')
     setStep(6)
   }catch(e){
     setError(e.message)
   }finally{
     setBusy(false)
   }
 }

 return <section className="facility-module">
  <div className="page-head">
   <div>
    <h1>{ar?'إعداد المشروع':'Project Setup'}</h1>
    <p className="muted">{ar?'مسار واحد: شركة الصيانة ← المشروع ← المالك ← العقد ← الموقع ← فريق المشروع':'One flow: Maintenance Company → Project → Owner → Contract → Site → Project Team'}</p>
   </div>
  </div>

  {error&&<div className="alert error">{error}</div>}
  {success&&<div className="alert success">{success}</div>}

  <StepPanel active={step===1} n={1} title={ar?'شركة الصيانة وبيانات المشروع':'Maintenance Company & Project'} onOpen={()=>setStep(1)} ar={ar}>
   <div className="form-grid">
    <label>{ar?'شركة الصيانة':'Maintenance Company'}
     <select value={form.organization_id} onChange={e=>set('organization_id',e.target.value)}>
      <option value="">{ar?'اختر...':'Select...'}</option>
      {cat.organizations.map(x=><option key={x.id} value={x.id}>{label(x,ar)}</option>)}
     </select>
    </label>
    <button type="button" className="btn secondary" onClick={()=>toggleAdd('organization')}>{ar?'+ إضافة شركة غير موجودة':'+ Add missing company'}</button>
    <label>{ar?'اسم المشروع':'Project name'}<input value={form.name} onChange={e=>set('name',e.target.value)}/></label>
    <label>{ar?'تاريخ البداية':'Start date'}<input type="date" value={form.start_date} onChange={e=>set('start_date',e.target.value)}/></label>
    <label>{ar?'تاريخ النهاية':'End date'}<input type="date" value={form.end_date} onChange={e=>set('end_date',e.target.value)}/></label>
   </div>

   <AddPanel open={!!newOpen.organization} ar={ar} busy={busy} onSave={()=>addRef('organization')} onCancel={()=>toggleAdd('organization')}>
    <label>{ar?'اسم شركة الصيانة':'Maintenance company name'}<input value={newData.organization_name||''} onChange={e=>nd('organization_name',e.target.value)}/></label>
   </AddPanel>

   <button className="btn primary" type="button" onClick={()=>setStep(2)}>{ar?'التالي: المالك':'Next: Owner'}</button>
  </StepPanel>

  <StepPanel active={step===2} n={2} title={ar?'المالك / العميل':'Owner / Client'} onOpen={()=>setStep(2)} ar={ar}>
   <label>{ar?'اختر مالك موجود':'Choose existing owner'}
    <select value={form.client_id} onChange={e=>set('client_id',e.target.value)}>
     <option value="">{ar?'اختر...':'Select...'}</option>
     {clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
   </label>
   <button type="button" className="btn secondary" onClick={()=>toggleAdd('client')}>{ar?'+ إضافة مالك جديد':'+ Add new owner'}</button>
   <AddPanel open={!!newOpen.client} ar={ar} busy={busy} onSave={()=>addRef('client')} onCancel={()=>toggleAdd('client')}>
    <div className="form-grid">
     <label>{ar?'اسم المالك':'Owner name'}<input value={newData.client_name||''} onChange={e=>nd('client_name',e.target.value)}/></label>
     <label>{ar?'البريد':'Email'}<input value={newData.client_email||''} onChange={e=>nd('client_email',e.target.value)}/></label>
     <label>{ar?'الهاتف':'Phone'}<input value={newData.client_phone||''} onChange={e=>nd('client_phone',e.target.value)}/></label>
    </div>
   </AddPanel>
   <button className="btn primary" type="button" disabled={!form.client_id} onClick={()=>setStep(3)}>{ar?'التالي: العقد':'Next: Contract'}</button>
  </StepPanel>

  <StepPanel active={step===3} n={3} title={ar?'العقد':'Contract'} onOpen={()=>setStep(3)} ar={ar}>
   <label>{ar?'اختر عقد موجود':'Choose existing contract'}
    <select value={form.contract_id} onChange={e=>set('contract_id',e.target.value)}>
     <option value="">{ar?'بدون عقد / اختر...':'No contract / Select...'}</option>
     {contracts.map(x=><option key={x.id} value={x.id}>{x.contract_number||x.contract_type||x.id}</option>)}
    </select>
   </label>
   <button type="button" className="btn secondary" onClick={()=>toggleAdd('contract')}>{ar?'+ إضافة عقد جديد':'+ Add new contract'}</button>
   <AddPanel open={!!newOpen.contract} ar={ar} busy={busy} onSave={()=>addRef('contract')} onCancel={()=>toggleAdd('contract')}>
    <div className="form-grid">
     <label>{ar?'رقم العقد':'Contract number'}<input value={newData.contract_number||''} onChange={e=>nd('contract_number',e.target.value)}/></label>
     <label>{ar?'نوع العقد':'Contract type'}<input value={newData.contract_type||''} onChange={e=>nd('contract_type',e.target.value)}/></label>
     <label>{ar?'البداية':'Start'}<input type="date" value={newData.contract_start||''} onChange={e=>nd('contract_start',e.target.value)}/></label>
     <label>{ar?'النهاية':'End'}<input type="date" value={newData.contract_end||''} onChange={e=>nd('contract_end',e.target.value)}/></label>
     <label>{ar?'قيمة العقد':'Contract value'}<input type="number" value={newData.contract_value||''} onChange={e=>nd('contract_value',e.target.value)}/></label>
    </div>
   </AddPanel>
   <button className="btn primary" type="button" onClick={()=>setStep(4)}>{ar?'التالي: الموقع':'Next: Site'}</button>
  </StepPanel>

  <StepPanel active={step===4} n={4} title={ar?'المستشفى / الموقع':'Hospital / Site'} onOpen={()=>setStep(4)} ar={ar}>
   <label>{ar?'اختر موقع موجود':'Choose existing site'}
    <select value={form.site_id} onChange={e=>set('site_id',e.target.value)}>
     <option value="">{ar?'بدون موقع / اختر...':'No site / Select...'}</option>
     {sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
   </label>
   <button type="button" className="btn secondary" onClick={()=>toggleAdd('site')}>{ar?'+ إضافة مستشفى / موقع':'+ Add hospital / site'}</button>

   <AddPanel open={!!newOpen.site} ar={ar} busy={busy} onSave={()=>addRef('site')} onCancel={()=>toggleAdd('site')}>
    <div className="form-grid">
     <label>{ar?'اسم المستشفى / الموقع':'Hospital / site name'}<input value={newData.site_name||''} onChange={e=>nd('site_name',e.target.value)}/></label>
     <label>{ar?'المدينة':'City'}<input value={newData.site_city||''} onChange={e=>nd('site_city',e.target.value)}/></label>
     <label>{ar?'العنوان':'Address'}<input value={newData.site_address||''} onChange={e=>nd('site_address',e.target.value)}/></label>
     <label>Latitude<input type="number" step="any" min="-90" max="90" value={newData.site_latitude||''} onChange={e=>nd('site_latitude',e.target.value)}/></label>
     <label>Longitude<input type="number" step="any" min="-180" max="180" value={newData.site_longitude||''} onChange={e=>nd('site_longitude',e.target.value)}/></label>
     <div style={{display:'flex',alignItems:'end'}}>
      <button type="button" className="btn secondary" onClick={useCurrentLocation}>{ar?'📍 استخدام موقعي الحالي':'📍 Use my current location'}</button>
     </div>
    </div>
   </AddPanel>

   <button className="btn primary" type="button" onClick={()=>setStep(5)}>{ar?'التالي: فريق المشروع':'Next: Project Team'}</button>
  </StepPanel>

  <StepPanel active={step===5} n={5} title={ar?'فريق المشروع / المستخدمون':'Project Team / Users'} onOpen={()=>setStep(5)} ar={ar}>
   {team.map((r,i)=><div className="form-grid" key={i} style={{alignItems:'end',marginBottom:10}}>
    <label>{ar?'المستخدم':'User'}<select value={r.user_id} onChange={e=>updateTeam(i,'user_id',e.target.value)}>
     <option value="">{ar?'اختر...':'Select...'}</option>
     {users.map(u=><option key={u.id||u.user_id} value={u.id||u.user_id}>{u.full_name||u.email}</option>)}
    </select></label>
    <label>{ar?'الدور':'Role'}<select value={r.role_id} onChange={e=>updateTeam(i,'role_id',e.target.value)}>
     <option value="">{ar?'اختر...':'Select...'}</option>
     {roles.map(x=><option key={x.id} value={x.id}>{x.name||x.code}</option>)}
    </select></label>
    <label>{ar?'الموقع':'Site'}<select value={r.site_id} onChange={e=>updateTeam(i,'site_id',e.target.value)}>
     <option value="">{ar?'كل المشروع':'Whole project'}</option>
     {sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select></label>
    <button type="button" className="btn secondary" onClick={()=>removeTeam(i)}>{ar?'حذف':'Remove'}</button>
   </div>)}
   <button type="button" className="btn secondary" onClick={addTeamRow}>{ar?'+ إضافة عضو فريق':'+ Add team member'}</button>
   <div style={{marginTop:16}}><button className="btn primary" type="button" onClick={()=>setStep(6)}>{ar?'مراجعة نهائية':'Final review'}</button></div>
  </StepPanel>

  <StepPanel active={step===6} n={6} title={ar?'المراجعة والحفظ':'Review & Save'} onOpen={()=>setStep(6)} ar={ar}>
   <div className="facility-panel">
    <p><b>{ar?'شركة الصيانة:':'Company:'}</b> {label(cat.organizations.find(x=>x.id===form.organization_id)||{},ar)}</p>
    <p><b>{ar?'المشروع:':'Project:'}</b> {form.name}</p>
    <p><b>{ar?'المالك:':'Owner:'}</b> {clients.find(x=>x.id===form.client_id)?.name||'-'}</p>
    <p><b>{ar?'العقد:':'Contract:'}</b> {contracts.find(x=>x.id===form.contract_id)?.contract_number||'-'}</p>
    <p><b>{ar?'الموقع:':'Site:'}</b> {sites.find(x=>x.id===form.site_id)?.name||'-'}</p>
    <p><b>{ar?'عدد أعضاء الفريق:':'Team members:'}</b> {team.filter(x=>x.user_id&&x.role_id).length}</p>
   </div>
   <button className="btn primary" type="button" disabled={busy} onClick={saveAll}>
    {busy?(ar?'جاري الحفظ...':'Saving...'):(ar?'حفظ وإعداد المشروع':'Save & Setup Project')}
   </button>
  </StepPanel>
 </section>
}
