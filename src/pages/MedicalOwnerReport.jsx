import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {supabase} from '../lib/supabaseClient'
import {medCreateOwnerReport} from '../lib/medicalOperational'

export default function MedicalOwnerReport(){
 const {profile}=useAuth(),{lang}=useLanguage()
 const ar=lang==='ar'
 const [scope,setScope]=useState([]),[assets,setAssets]=useState([])
 const [form,setForm]=useState({organization_id:'',client_id:'',site_id:'',asset_id:'',complaint:'',priority:'P3'})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ok,setOk]=useState('')

 const load=async()=>{
  const {data,error}=await supabase.from('bf_med_owner_representatives')
   .select('organization_id,client_id,site_id,can_create_report')
   .eq('user_id',profile.id).eq('is_active',true)
  if(error)throw error
  setScope(data||[])
 }
 useEffect(()=>{if(profile?.id)load().catch(e=>setError(e.message))},[profile?.id])

 useEffect(()=>{
  if(!form.organization_id||!form.client_id||!form.site_id){setAssets([]);return}
  supabase.from('bf_med_tenant_assets')
   .select('asset_id,bf_assets!inner(id,asset_number,asset_name,name,manufacturer,model,serial_number)')
   .eq('organization_id',form.organization_id)
   .eq('client_id',form.client_id)
   .eq('site_id',form.site_id)
   .eq('status','active')
   .then(({data,error})=>{if(error)setError(error.message);else setAssets(data||[])})
 },[form.organization_id,form.client_id,form.site_id])

 const orgs=[...new Set(scope.map(x=>x.organization_id))]
 const clients=[...new Set(scope.filter(x=>!form.organization_id||x.organization_id===form.organization_id).map(x=>x.client_id))]
 const sites=[...new Set(scope.filter(x=>(!form.organization_id||x.organization_id===form.organization_id)&&(!form.client_id||x.client_id===form.client_id)).map(x=>x.site_id).filter(Boolean))]

 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');setOk('')
  try{
   const x=await medCreateOwnerReport(form)
   setOk((ar?'تم إنشاء البلاغ وأمر العمل مباشرة: ':'Owner report and Work Order created immediately: ')+(x.work_order_number||x.work_order_id))
   setForm(v=>({...v,asset_id:'',complaint:'',priority:'P3'}))
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 return <section className="facility-module">
  <div className="page-head"><div><h1>{ar?'بلاغ صيانة جهاز طبي':'Medical Device Service Report'}</h1>
  <p className="muted">{ar?'حفظ البلاغ ينشئ أمر عمل تصحيحي فورًا داخل شركة الصيانة.':'Submitting the report creates a corrective Work Order immediately.'}</p></div></div>
  {error&&<div className="alert error">{error}</div>}
  {ok&&<div className="alert success">{ok}</div>}
  <form className="facility-panel" onSubmit={submit}><div className="form-grid">
   <label>{ar?'شركة الصيانة':'Maintenance company'}<select required value={form.organization_id} onChange={e=>setForm(v=>({...v,organization_id:e.target.value,client_id:'',site_id:'',asset_id:''}))}><option value="">{ar?'اختر':'Select'}</option>{orgs.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
   <label>{ar?'المالك':'Owner'}<select required value={form.client_id} onChange={e=>setForm(v=>({...v,client_id:e.target.value,site_id:'',asset_id:''}))}><option value="">{ar?'اختر':'Select'}</option>{clients.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
   <label>{ar?'المستشفى':'Hospital'}<select required value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value,asset_id:''}))}><option value="">{ar?'اختر':'Select'}</option>{sites.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
   <label>{ar?'الجهاز الطبي':'Medical asset'}<select required value={form.asset_id} onChange={e=>setForm(v=>({...v,asset_id:e.target.value}))}><option value="">{ar?'اختر الجهاز':'Select asset'}</option>{assets.map(x=>{const a=x.bf_assets||{};return <option key={x.asset_id} value={x.asset_id}>{a.asset_number||a.asset_name||a.name||x.asset_id} {a.model?'- '+a.model:''}</option>})}</select></label>
   <label>{ar?'الأولوية':'Priority'}<select value={form.priority} onChange={e=>setForm(v=>({...v,priority:e.target.value}))}><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label>
   <label className="span-2">{ar?'وصف العطل / البلاغ':'Complaint'}<textarea required rows="4" value={form.complaint} onChange={e=>setForm(v=>({...v,complaint:e.target.value}))}/></label>
  </div><div className="form-actions"><button className="btn primary" disabled={busy}>{ar?'إرسال البلاغ وإنشاء أمر العمل':'Submit report & create Work Order'}</button></div></form>
 </section>
}
