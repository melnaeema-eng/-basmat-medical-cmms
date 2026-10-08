import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {supabase} from '../lib/supabaseClient'
import {medRegisterTenant,medLinkClient,medLinkSite,medOperationalDirectory} from '../lib/medicalOperational'

const emptyTenant={name_ar:'',name_en:'',registration_no:'',vat_no:'',email:'',phone:'',city:'',address:'',logo_url:'',brand_color:'',report_footer:''}
const emptyClient={organization_id:'',name:'',email:'',phone:''}
const emptySite={organization_id:'',client_id:'',name:'',city:'',address:'',latitude:'',longitude:''}

export default function MedicalTenantAdmin(){
 const {profile}=useAuth()
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const isSuper=!!profile?.is_super_admin
 const [orgs,setOrgs]=useState([]),[clients,setClients]=useState([]),[sites,setSites]=useState([])
 const [tenant,setTenant]=useState(emptyTenant),[client,setClient]=useState(emptyClient),[site,setSite]=useState(emptySite)
 const [selectedOrg,setSelectedOrg]=useState('')
 const [directory,setDirectory]=useState({tenant:{},clients:[],sites:[],assets:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('')

 const load=async()=>{
  const [o,c,s]=await Promise.all([
   supabase.from('bf_organizations').select('*').order('created_at',{ascending:false}),
   supabase.from('bf_clients').select('*').order('created_at',{ascending:false}),
   supabase.from('bf_sites').select('*').order('created_at',{ascending:false})
  ])
  if(o.error)throw o.error;if(c.error)throw c.error;if(s.error)throw s.error
  setOrgs(o.data||[]);setClients(c.data||[]);setSites(s.data||[])
 }
 useEffect(()=>{load().catch(e=>setError(e.message))},[])
 useEffect(()=>{
  if(selectedOrg)medOperationalDirectory(selectedOrg).then(setDirectory).catch(()=>setDirectory({tenant:{},clients:[],sites:[],assets:[]}))
 },[selectedOrg])

 const saveTenant=async e=>{
  e.preventDefault();setBusy(true);setError('');setOk('')
  try{
   const payload={
    name:(tenant.name_ar||tenant.name_en).trim(),
    name_ar:tenant.name_ar||null,name_en:tenant.name_en||null,
    organization_type:'maintenance_contractor',
    registration_no:tenant.registration_no||null,vat_no:tenant.vat_no||null,
    email:tenant.email||null,phone:tenant.phone||null,city:tenant.city||null,address:tenant.address||null,
    logo_url:tenant.logo_url||null,status:'active'
   }
   const {data,error}=await supabase.from('bf_organizations').insert(payload).select('*').single()
   if(error)throw error
   await medRegisterTenant(data.id)
   if(tenant.brand_color||tenant.report_footer){
    const {error:e2}=await supabase.from('bf_med_tenant_companies').update({
     brand_color:tenant.brand_color||null,report_footer:tenant.report_footer||null
    }).eq('organization_id',data.id)
    if(e2)throw e2
   }
   setTenant(emptyTenant);setSelectedOrg(data.id)
   await load();setDirectory(await medOperationalDirectory(data.id))
   setOk(ar?'تمت إضافة شركة الصيانة وظهرت مباشرة':'Maintenance company added and shown immediately')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const saveClient=async e=>{
  e.preventDefault();setBusy(true);setError('');setOk('')
  try{
   const {data,error}=await supabase.from('bf_clients').insert({
    organization_id:client.organization_id,name:client.name.trim(),
    email:client.email||null,phone:client.phone||null,status:'active'
   }).select('*').single()
   if(error)throw error
   await medLinkClient(client.organization_id,data.id)
   setClient({...emptyClient,organization_id:client.organization_id})
   await load();setDirectory(await medOperationalDirectory(client.organization_id))
   setOk(ar?'تمت إضافة المالك وظهر مباشرة':'Owner/client added and shown immediately')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const saveSite=async e=>{
  const lat=Number(site.latitude),lng=Number(site.longitude)
  if(String(site.latitude).trim()===''||String(site.longitude).trim()===''||!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180){
    setError('Enter valid Latitude and Longitude before saving')
    return
  }
  e.preventDefault();setBusy(true);setError('');setOk('')
  try{
   const {data,error}=await supabase.from('bf_sites').insert({
    organization_id:site.organization_id,client_id:site.client_id,
    name:site.name.trim(),city:site.city||null,address:site.address||null,latitude:Number(site.latitude),longitude:Number(site.longitude),location_source:'manual',status:'active'
   }).select('*').single()
   if(error)throw error
   await medLinkSite(site.organization_id,site.client_id,data.id)
   setSite({...emptySite,organization_id:site.organization_id,client_id:site.client_id})
   await load();setDirectory(await medOperationalDirectory(site.organization_id))
   setOk(ar?'تمت إضافة المستشفى وظهر مباشرة':'Hospital/site added and shown immediately')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 if(!isSuper)return <section className="facility-module"><div className="alert error">{ar?'Super Admin فقط':'Super Admin only'}</div></section>

 return <section className="facility-module">
  <div className="page-head"><div><h1>{ar?'إدارة شركات الصيانة والملاك الطبية':'Medical Tenant Administration'}</h1>
  <p className="muted">{ar?'هذه الصفحة تعرض النطاق الطبي فقط. لا يوجد fallback إلى بيانات المرافق.':'Medical scope only. No Facilities fallback.'}</p></div></div>
  {error&&<div className="alert error">{error}</div>}
  {ok&&<div className="alert success">{ok}</div>}

  <div className="facility-panel">
   <h2>{ar?'إضافة شركة صيانة طبية':'Add Medical Maintenance Company'}</h2>
   <form onSubmit={saveTenant}><div className="form-grid">
    <label>{ar?'الاسم العربي':'Arabic name'}<input value={tenant.name_ar} onChange={e=>setTenant(v=>({...v,name_ar:e.target.value}))} required/></label>
    <label>{ar?'الاسم الإنجليزي':'English name'}<input value={tenant.name_en} onChange={e=>setTenant(v=>({...v,name_en:e.target.value}))}/></label>
    <label>{ar?'السجل التجاري':'Registration'}<input value={tenant.registration_no} onChange={e=>setTenant(v=>({...v,registration_no:e.target.value}))}/></label>
    <label>{ar?'الرقم الضريبي':'VAT'}<input value={tenant.vat_no} onChange={e=>setTenant(v=>({...v,vat_no:e.target.value}))}/></label>
    <label>{ar?'البريد':'Email'}<input value={tenant.email} onChange={e=>setTenant(v=>({...v,email:e.target.value}))}/></label>
    <label>{ar?'الهاتف':'Phone'}<input value={tenant.phone} onChange={e=>setTenant(v=>({...v,phone:e.target.value}))}/></label>
    <label>{ar?'المدينة':'City'}<input value={tenant.city} onChange={e=>setTenant(v=>({...v,city:e.target.value}))}/></label>
    <label>{ar?'لون الهوية':'Brand color'}<input value={tenant.brand_color} onChange={e=>setTenant(v=>({...v,brand_color:e.target.value}))} placeholder="#0B5CAB"/></label>
    <label className="span-2">{ar?'رابط الشعار':'Logo URL'}<input value={tenant.logo_url} onChange={e=>setTenant(v=>({...v,logo_url:e.target.value}))}/></label>
    <label className="span-2">{ar?'العنوان':'Address'}<input value={tenant.address} onChange={e=>setTenant(v=>({...v,address:e.target.value}))}/></label>
    <label className="span-2">{ar?'تذييل التقارير':'Report footer'}<input value={tenant.report_footer} onChange={e=>setTenant(v=>({...v,report_footer:e.target.value}))}/></label>
   </div><div className="form-actions"><button className="btn primary" disabled={busy}>{ar?'حفظ شركة الصيانة':'Save maintenance company'}</button></div></form>
  </div>

  <div className="facility-panel">
   <h2>{ar?'إضافة مالك / عميل':'Add Owner / Client'}</h2>
   <form onSubmit={saveClient}><div className="form-grid">
    <label>{ar?'شركة الصيانة':'Maintenance company'}<select required value={client.organization_id} onChange={e=>{setClient(v=>({...v,organization_id:e.target.value}));setSelectedOrg(e.target.value)}}><option value="">{ar?'اختر':'Select'}</option>{orgs.map(x=><option key={x.id} value={x.id}>{x.name_ar||x.name_en||x.name}</option>)}</select></label>
    <label>{ar?'اسم المالك':'Owner/client name'}<input required value={client.name} onChange={e=>setClient(v=>({...v,name:e.target.value}))}/></label>
    <label>{ar?'البريد':'Email'}<input value={client.email} onChange={e=>setClient(v=>({...v,email:e.target.value}))}/></label>
    <label>{ar?'الهاتف':'Phone'}<input value={client.phone} onChange={e=>setClient(v=>({...v,phone:e.target.value}))}/></label>
   </div><div className="form-actions"><button className="btn primary" disabled={busy}>{ar?'حفظ المالك':'Save owner/client'}</button></div></form>
  </div>

  <div className="facility-panel">
   <h2>{ar?'إضافة مستشفى / موقع':'Add Hospital / Site'}</h2>
   <form onSubmit={saveSite}><div className="form-grid">
<label>Latitude<input type="number" step="any" min="-90" max="90" required value={site.latitude} onChange={e=>setSite(v=>({...v,latitude:e.target.value}))}/></label>
<label>Longitude<input type="number" step="any" min="-180" max="180" required value={site.longitude} onChange={e=>setSite(v=>({...v,longitude:e.target.value}))}/></label>
    <label>{ar?'شركة الصيانة':'Maintenance company'}<select required value={site.organization_id} onChange={e=>{setSite(v=>({...v,organization_id:e.target.value,client_id:''}));setSelectedOrg(e.target.value)}}><option value="">{ar?'اختر':'Select'}</option>{orgs.map(x=><option key={x.id} value={x.id}>{x.name_ar||x.name_en||x.name}</option>)}</select></label>
    <label>{ar?'المالك':'Owner/client'}<select required value={site.client_id} onChange={e=>setSite(v=>({...v,client_id:e.target.value}))}><option value="">{ar?'اختر':'Select'}</option>{clients.filter(x=>x.organization_id===site.organization_id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label>{ar?'اسم المستشفى':'Hospital name'}<input required value={site.name} onChange={e=>setSite(v=>({...v,name:e.target.value}))}/></label>
    <label>{ar?'المدينة':'City'}<input value={site.city} onChange={e=>setSite(v=>({...v,city:e.target.value}))}/></label>
    <label className="span-2">{ar?'العنوان':'Address'}<input value={site.address} onChange={e=>setSite(v=>({...v,address:e.target.value}))}/></label>
   </div><div className="form-actions"><button className="btn primary" disabled={busy}>{ar?'حفظ المستشفى':'Save hospital/site'}</button></div></form>
  </div>

  <div className="facility-panel">
   <h2>{ar?'النطاق الطبي الحالي':'Current Medical Scope'}</h2>
   <label>{ar?'شركة الصيانة':'Maintenance company'}<select value={selectedOrg} onChange={e=>setSelectedOrg(e.target.value)}><option value="">{ar?'اختر':'Select'}</option>{orgs.map(x=><option key={x.id} value={x.id}>{x.name_ar||x.name_en||x.name}</option>)}</select></label>
   {selectedOrg&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12,marginTop:16}}>
    <div className="kpi-card"><b>{ar?'الملاك':'Owners'}</b><strong>{directory.clients?.length||0}</strong></div>
    <div className="kpi-card"><b>{ar?'المستشفيات':'Hospitals'}</b><strong>{directory.sites?.length||0}</strong></div>
    <div className="kpi-card"><b>{ar?'الأجهزة الطبية':'Medical Assets'}</b><strong>{directory.assets?.length||0}</strong></div>
   </div>}
   {selectedOrg&&<div className="security-check-list" style={{marginTop:16}}>
    {(directory.clients||[]).map(c=><article key={c.id} className="facility-panel"><strong>{c.name}</strong><div className="muted">{c.code||''}</div></article>)}
    {(directory.sites||[]).map(s=><article key={s.id} className="facility-panel"><strong>{s.name}</strong><div className="muted">{s.city||''}</div></article>)}
   </div>}
  </div>
 </section>
}
