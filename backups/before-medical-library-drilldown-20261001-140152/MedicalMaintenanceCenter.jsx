import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMedicalCenter,registerMedicalAsset,completeMedicalActivity,createMedicalWorkOrder,saveMedicalType,saveMedicalManufacturer} from '../lib/medicalMaintenance'
import {Field,Notice} from '../components/FacilityFields'

const groupLabels={
 PATIENT_MONITORING:['مراقبة المرضى','Patient Monitoring'],
 CRITICAL_CARE:['العناية الحرجة','Critical Care'],
 ANESTHESIA_OR:['التخدير وغرف العمليات','Anesthesia & OR'],
 IMAGING:['الأشعة والتصوير الطبي','Medical Imaging'],
 LAB:['المختبرات وبنك الدم','Laboratory & Blood Bank'],
 STERILIZATION:['التعقيم المركزي CSSD','Sterilization / CSSD'],
 DIALYSIS:['غسيل الكلى','Dialysis'],
 NEONATAL_MATERNITY:['حديثي الولادة والولادة','Neonatal & Maternity'],
 ENDOSCOPY:['المناظير','Endoscopy'],
 EMERGENCY:['الطوارئ','Emergency'],
 DENTAL:['الأسنان','Dental'],
 OPHTHALMOLOGY:['العيون','Ophthalmology'],
 PHARMACY:['الصيدلية','Pharmacy'],
 REHAB:['العلاج الطبيعي والتأهيل','Rehabilitation'],
 GENERAL_MEDICAL:['أجهزة طبية عامة','General Medical Equipment']
}

const emptyAsset={organization_id:'',master_type_id:'',manufacturer_id:'',asset_tag:'',model:'',serial_number:'',department:'',site_name:'',location_text:'',sfda_registration_number:'',risk_class:'',installation_date:'',warranty_end_date:''}
const emptyActivity={asset_id:'',activity_type:'preventive',result:'pass',certificate_number:'',service_provider:'',next_due_date:'',notes:''}
const emptyWO={asset_id:'',work_type:'corrective',title:'',description:'',priority:'normal',due_date:''}
const emptyType={id:'',system_code:'GENERAL_MEDICAL',code:'',name_ar:'',name_en:'',icon_text:'🏥',default_criticality:'high',default_pm_months:12,default_calibration_months:12,procurement_class:'standard',default_lead_time_days:45}
const emptyBrand={id:'',code:'',name:''}

function fmt(d){if(!d)return'—';try{return new Date(d).toLocaleDateString()}catch{return d}}
function dueState(d){if(!d)return'none';const n=new Date();n.setHours(0,0,0,0);const x=new Date(d);const days=(x-n)/86400000;return days<0?'overdue':days<=30?'soon':'ok'}

export default function MedicalMaintenanceCenter(){
 const {access,can}=useAuth(),{lang}=useLanguage()
 const [data,setData]=useState(null),[tab,setTab]=useState('dashboard'),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [query,setQuery]=useState(''),[system,setSystem]=useState(''),[org,setOrg]=useState('')
 const [assetForm,setAssetForm]=useState(emptyAsset),[activity,setActivity]=useState(emptyActivity),[wo,setWo]=useState(emptyWO)
 const [typeForm,setTypeForm]=useState(emptyType),[brandForm,setBrandForm]=useState(emptyBrand)
 const load=async()=>{try{setError('');setData(await loadMedicalCenter())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])

 const mfrMap=useMemo(()=>new Map((data?.manufacturers||[]).map(x=>[x.id,x])),[data])
 const typeMap=useMemo(()=>new Map((data?.types||[]).map(x=>[x.id,x])),[data])
 const allowedOrgs=useMemo(()=>{
  if(!data)return[]
  if(access?.super_admin)return data.organizations
  const ids=new Set((access?.roles||[]).filter(r=>r.permission==='medical.manage'||r.permission==='medical.view').map(r=>r.organization_id))
  return data.organizations.filter(x=>ids.has(x.id))
 },[data,access])
 useEffect(()=>{if(!org&&allowedOrgs.length===1){setOrg(allowedOrgs[0].id);setAssetForm(v=>({...v,organization_id:allowedOrgs[0].id}))}},[allowedOrgs,org])

 const systems=useMemo(()=>[...new Set((data?.types||[]).map(x=>x.system_code))].sort(),[data])
 const library=useMemo(()=>{
  if(!data)return[]
  const q=query.toLowerCase()
  return data.types.filter(t=>{
   const opts=data.options.filter(o=>o.asset_type_id===t.id)
   const txt=[t.code,t.name_ar,t.name_en,t.system_code,...opts.map(o=>mfrMap.get(o.manufacturer_id)?.name||'')].join(' ').toLowerCase()
   return (!system||t.system_code===system)&&(!q||txt.includes(q))
  }).map(t=>({...t,brands:data.options.filter(o=>o.asset_type_id===t.id).map(o=>mfrMap.get(o.manufacturer_id)).filter(Boolean)}))
 },[data,query,system,mfrMap])

 const orgAssets=useMemo(()=>!data?[]:data.assets.filter(a=>!org||a.organization_id===org),[data,org])
 const filteredAssets=useMemo(()=>{
  const q=query.toLowerCase()
  return orgAssets.filter(a=>{
   const t=typeMap.get(a.master_type_id),m=mfrMap.get(a.manufacturer_id)
   return !q||[a.asset_tag,a.model,a.serial_number,a.department,a.site_name,a.location_text,t?.name_ar,t?.name_en,m?.name].join(' ').toLowerCase().includes(q)
  })
 },[orgAssets,query,typeMap,mfrMap])

 const now=new Date();now.setHours(0,0,0,0)
 const stats=useMemo(()=>{
  const total=orgAssets.length
  const overduePm=orgAssets.filter(a=>a.next_pm_date&&new Date(a.next_pm_date)<now).length
  const overdueCal=orgAssets.filter(a=>a.next_calibration_date&&new Date(a.next_calibration_date)<now).length
  const out=orgAssets.filter(a=>a.operational_status==='out_of_service').length
  const openWO=(data?.workOrders||[]).filter(w=>(!org||w.organization_id===org)&&!['completed','closed','cancelled'].includes(w.status)).length
  return {total,overduePm,overdueCal,out,openWO}
 },[orgAssets,data,org])

 async function doRegister(){
  try{setBusy(true);setError('');setSuccess('');await registerMedicalAsset({...assetForm,organization_id:assetForm.organization_id||org});setAssetForm({...emptyAsset,organization_id:org});await load();setSuccess(lang==='ar'?'تم تسجيل الجهاز الطبي.':'Medical device registered.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function doActivity(){
  try{setBusy(true);setError('');setSuccess('');await completeMedicalActivity(activity);setActivity(emptyActivity);await load();setSuccess(lang==='ar'?'تم تسجيل نشاط الصيانة/المعايرة.':'Maintenance/calibration activity recorded.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function doWO(){
  try{setBusy(true);setError('');setSuccess('');await createMedicalWorkOrder(wo);setWo(emptyWO);await load();setSuccess(lang==='ar'?'تم إنشاء أمر العمل الطبي.':'Medical work order created.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function doType(){
  try{setBusy(true);setError('');await saveMedicalType(typeForm);setTypeForm(emptyType);await load();setSuccess(lang==='ar'?'تم حفظ نوع الجهاز.':'Medical device type saved.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function doBrand(){
  try{setBusy(true);setError('');await saveMedicalManufacturer(brandForm);setBrandForm(emptyBrand);await load();setSuccess(lang==='ar'?'تم حفظ الشركة المصنعة.':'Manufacturer saved.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }

 if(!data)return <section className="facility-module"><h1>{lang==='ar'?'صيانة الأجهزة الطبية':'Medical Equipment Maintenance'}</h1><Notice error={error}/><p>Loading…</p></section>

 return <section className="facility-module">
  <style>{`
   .med-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}
   .med-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
   .med-card{border:1px solid #dfe7ef;border-radius:14px;padding:12px;background:#fff}
   .med-icon{width:38px;height:38px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;background:#f2f7fb;font-size:21px}
   .med-badge{display:inline-block;padding:3px 7px;border:1px solid #dfe7ef;border-radius:999px;font-size:10px;margin:2px;background:#fff}
   .med-overdue{color:#a61b1b;font-weight:800}.med-soon{color:#8a5b00;font-weight:800}
  `}</style>

  <div className="page-head">
   <div><h1>🏥 {lang==='ar'?'صيانة الأجهزة الطبية':'Medical Equipment Maintenance'}</h1>
    <p>{lang==='ar'?'قسم مستقل عن صيانة الأجهزة الطبية: سجل الأجهزة، الصيانة الوقائية، المعايرة، أوامر العمل والمكتبة الطبية.':'Separate from Medical Equipment Maintenance: device register, PM, calibration, work orders and medical master library.'}</p>
   </div>
  </div>
  <Notice error={error} success={success}/>

  <div className="facility-panel">
   <div className="med-grid">
    <Field label={lang==='ar'?'المنظمة':'Organization'}>
     <select value={org} onChange={e=>{setOrg(e.target.value);setAssetForm(v=>({...v,organization_id:e.target.value}))}}>
      <option value="">{lang==='ar'?'كل المتاح':'All available'}</option>
      {allowedOrgs.map(x=><option key={x.id} value={x.id}>{x.name||x.code}</option>)}
     </select>
    </Field>
    <Field label={lang==='ar'?'بحث':'Search'}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ventilator / MRI / GE / Philips / Serial..."/></Field>
   </div>
  </div>

  <div className="med-tabs">
   {[['dashboard','📊','اللوحة','Dashboard'],['library','📚','المكتبة','Library'],['register','🏷️','سجل الأجهزة','Device Register'],['pm','🧰','الصيانة والمعايرة','PM & Calibration'],['workorders','📝','أوامر العمل','Work Orders']].map(x=>
    <button key={x[0]} className={'btn '+(tab===x[0]?'primary':'')} onClick={()=>setTab(x[0])}>{x[1]} {lang==='ar'?x[2]:x[3]}</button>)}
   {access?.super_admin&&<button className={'btn '+(tab==='admin'?'primary':'')} onClick={()=>setTab('admin')}>⚙️ {lang==='ar'?'إدارة المكتبة':'Library Admin'}</button>}
  </div>

  {tab==='dashboard'&&<>
   <div className="stats-grid facility-stats">
    <div className="stat-card"><span>{lang==='ar'?'إجمالي الأجهزة':'Medical devices'}</span><strong>{stats.total}</strong></div>
    <div className="stat-card"><span>{lang==='ar'?'PM متأخرة':'Overdue PM'}</span><strong>{stats.overduePm}</strong></div>
    <div className="stat-card"><span>{lang==='ar'?'معايرة متأخرة':'Overdue calibration'}</span><strong>{stats.overdueCal}</strong></div>
    <div className="stat-card"><span>{lang==='ar'?'خارج الخدمة':'Out of service'}</span><strong>{stats.out}</strong></div>
    <div className="stat-card"><span>{lang==='ar'?'أوامر عمل مفتوحة':'Open work orders'}</span><strong>{stats.openWO}</strong></div>
   </div>
   <div className="facility-panel">
    <h2>{lang==='ar'?'الأجهزة المستحقة':'Due devices'}</h2>
    <table className="facility-table"><thead><tr><th>{lang==='ar'?'الجهاز':'Device'}</th><th>Tag</th><th>PM</th><th>{lang==='ar'?'المعايرة':'Calibration'}</th><th>{lang==='ar'?'الحالة':'Status'}</th></tr></thead>
     <tbody>{orgAssets.filter(a=>['overdue','soon'].includes(dueState(a.next_pm_date))||['overdue','soon'].includes(dueState(a.next_calibration_date))).slice(0,20).map(a=>{
      const t=typeMap.get(a.master_type_id)
      return <tr key={a.id}><td>{t?.icon_text} {lang==='ar'?t?.name_ar:t?.name_en}</td><td>{a.asset_tag}</td>
       <td className={'med-'+dueState(a.next_pm_date)}>{fmt(a.next_pm_date)}</td>
       <td className={'med-'+dueState(a.next_calibration_date)}>{fmt(a.next_calibration_date)}</td><td>{a.operational_status}</td></tr>
     })}</tbody>
    </table>
   </div>
  </>}

  {tab==='library'&&<>
   <div className="facility-panel">
    <div className="med-grid">
     <Field label={lang==='ar'?'التخصص':'Category'}><select value={system} onChange={e=>setSystem(e.target.value)}><option value="">{lang==='ar'?'الكل':'All'}</option>{systems.map(s=><option value={s} key={s}>{lang==='ar'?(groupLabels[s]?.[0]||s):(groupLabels[s]?.[1]||s)}</option>)}</select></Field>
    </div>
   </div>
   {Object.entries(library.reduce((g,x)=>((g[x.system_code]??=[]).push(x),g),{})).map(([sys,rows])=><div key={sys}>
    <h2>{lang==='ar'?(groupLabels[sys]?.[0]||sys):(groupLabels[sys]?.[1]||sys)} ({rows.length})</h2>
    <div className="med-grid">{rows.map(t=><div className="med-card" key={t.id}>
     <div style={{display:'flex',gap:9}}><span className="med-icon">{t.icon_text}</span><div><small>{t.code}</small><h3 style={{margin:'2px 0'}}>{lang==='ar'?t.name_ar:t.name_en}</h3></div></div>
     <div><span className="med-badge">{t.default_criticality}</span><span className="med-badge">PM {t.default_pm_months||'—'}m</span><span className="med-badge">CAL {t.default_calibration_months||'—'}m</span>{t.procurement_class==='long_lead'&&<span className="med-badge">⏳ {t.default_lead_time_days}d</span>}</div>
     <div style={{fontSize:10,marginTop:6}}><b>{lang==='ar'?'المصنعون':'Brands'}:</b> {t.brands.slice(0,8).map(b=><span className="med-badge" key={b.id}>{b.name}</span>)}</div>
    </div>)}</div>
   </div>)}
  </>}

  {tab==='register'&&<>
   {can('medical.manage',org||null)&&<div className="facility-panel">
    <h2>{lang==='ar'?'تسجيل جهاز طبي':'Register Medical Device'}</h2>
    <div className="med-grid">
     <Field label={lang==='ar'?'المنظمة':'Organization'}><select value={assetForm.organization_id||org} onChange={e=>setAssetForm({...assetForm,organization_id:e.target.value})}><option value="">Select</option>{allowedOrgs.map(x=><option value={x.id} key={x.id}>{x.name||x.code}</option>)}</select></Field>
     <Field label={lang==='ar'?'نوع الجهاز':'Device type'}><select value={assetForm.master_type_id} onChange={e=>setAssetForm({...assetForm,master_type_id:e.target.value,manufacturer_id:''})}><option value="">Select</option>{data.types.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.icon_text} {lang==='ar'?x.name_ar:x.name_en}</option>)}</select></Field>
     <Field label={lang==='ar'?'الشركة المصنعة':'Manufacturer'}><select value={assetForm.manufacturer_id} onChange={e=>setAssetForm({...assetForm,manufacturer_id:e.target.value})}><option value="">Generic / Other</option>{data.options.filter(o=>!assetForm.master_type_id||o.asset_type_id===assetForm.master_type_id).map(o=>mfrMap.get(o.manufacturer_id)).filter(Boolean).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></Field>
     <Field label="Asset Tag"><input value={assetForm.asset_tag} onChange={e=>setAssetForm({...assetForm,asset_tag:e.target.value})}/></Field>
     <Field label="Model"><input value={assetForm.model} onChange={e=>setAssetForm({...assetForm,model:e.target.value})}/></Field>
     <Field label="Serial No."><input value={assetForm.serial_number} onChange={e=>setAssetForm({...assetForm,serial_number:e.target.value})}/></Field>
     <Field label={lang==='ar'?'القسم الطبي':'Department'}><input value={assetForm.department} onChange={e=>setAssetForm({...assetForm,department:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الموقع':'Site'}><input value={assetForm.site_name} onChange={e=>setAssetForm({...assetForm,site_name:e.target.value})}/></Field>
     <Field label={lang==='ar'?'المكان التفصيلي':'Location'}><input value={assetForm.location_text} onChange={e=>setAssetForm({...assetForm,location_text:e.target.value})}/></Field>
     <Field label="SFDA / Registration"><input value={assetForm.sfda_registration_number} onChange={e=>setAssetForm({...assetForm,sfda_registration_number:e.target.value})}/></Field>
     <Field label={lang==='ar'?'تصنيف الخطورة':'Risk Class'}><input value={assetForm.risk_class} onChange={e=>setAssetForm({...assetForm,risk_class:e.target.value})}/></Field>
     <Field label={lang==='ar'?'تاريخ التركيب':'Installation'}><input type="date" value={assetForm.installation_date} onChange={e=>setAssetForm({...assetForm,installation_date:e.target.value})}/></Field>
     <Field label={lang==='ar'?'نهاية الضمان':'Warranty end'}><input type="date" value={assetForm.warranty_end_date} onChange={e=>setAssetForm({...assetForm,warranty_end_date:e.target.value})}/></Field>
    </div>
    <button className="btn primary" disabled={busy} onClick={doRegister}>{lang==='ar'?'حفظ الجهاز':'Save Device'}</button>
   </div>}
   <div className="facility-panel"><h2>{lang==='ar'?'سجل الأجهزة':'Medical Device Register'}</h2>
    <table className="facility-table"><thead><tr><th>{lang==='ar'?'الجهاز':'Device'}</th><th>Tag</th><th>{lang==='ar'?'الشركة':'Brand'}</th><th>Model</th><th>{lang==='ar'?'القسم':'Department'}</th><th>PM</th><th>CAL</th><th>{lang==='ar'?'الحالة':'Status'}</th></tr></thead>
     <tbody>{filteredAssets.map(a=>{const t=typeMap.get(a.master_type_id),m=mfrMap.get(a.manufacturer_id);return <tr key={a.id}><td>{t?.icon_text} {lang==='ar'?t?.name_ar:t?.name_en}</td><td>{a.asset_tag}</td><td>{m?.name||'—'}</td><td>{a.model||'—'}</td><td>{a.department||'—'}</td><td>{fmt(a.next_pm_date)}</td><td>{fmt(a.next_calibration_date)}</td><td>{a.operational_status}</td></tr>})}</tbody>
    </table>
   </div>
  </>}

  {tab==='pm'&&<>
   <div className="facility-panel"><h2>{lang==='ar'?'تسجيل صيانة/معايرة':'Record PM / Calibration'}</h2>
    <div className="med-grid">
     <Field label={lang==='ar'?'الجهاز':'Device'}><select value={activity.asset_id} onChange={e=>setActivity({...activity,asset_id:e.target.value})}><option value="">Select</option>{orgAssets.map(a=><option value={a.id} key={a.id}>{a.asset_tag} · {typeMap.get(a.master_type_id)?.name_en}</option>)}</select></Field>
     <Field label={lang==='ar'?'نوع النشاط':'Activity'}><select value={activity.activity_type} onChange={e=>setActivity({...activity,activity_type:e.target.value})}><option value="preventive">preventive</option><option value="calibration">calibration</option><option value="verification">verification</option><option value="corrective_inspection">corrective_inspection</option></select></Field>
     <Field label={lang==='ar'?'النتيجة':'Result'}><select value={activity.result} onChange={e=>setActivity({...activity,result:e.target.value})}><option value="pass">pass</option><option value="pass_with_observation">pass_with_observation</option><option value="fail">fail</option></select></Field>
     <Field label={lang==='ar'?'رقم الشهادة':'Certificate No.'}><input value={activity.certificate_number} onChange={e=>setActivity({...activity,certificate_number:e.target.value})}/></Field>
     <Field label={lang==='ar'?'مزود الخدمة':'Service provider'}><input value={activity.service_provider} onChange={e=>setActivity({...activity,service_provider:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الاستحقاق القادم':'Next due'}><input type="date" value={activity.next_due_date} onChange={e=>setActivity({...activity,next_due_date:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الملاحظات':'Notes'}><textarea value={activity.notes} onChange={e=>setActivity({...activity,notes:e.target.value})}/></Field>
    </div>
    <button className="btn primary" disabled={busy||!activity.asset_id} onClick={doActivity}>{lang==='ar'?'تسجيل النشاط':'Record Activity'}</button>
   </div>
   <div className="facility-panel"><h2>{lang==='ar'?'السجل الأخير':'Recent History'}</h2>
    <table className="facility-table"><thead><tr><th>{lang==='ar'?'الجهاز':'Device'}</th><th>{lang==='ar'?'النشاط':'Activity'}</th><th>{lang==='ar'?'النتيجة':'Result'}</th><th>{lang==='ar'?'التاريخ':'Date'}</th><th>{lang==='ar'?'القادم':'Next due'}</th></tr></thead>
     <tbody>{data.history.filter(h=>!org||h.organization_id===org).slice(0,50).map(h=>{const a=data.assets.find(x=>x.id===h.asset_id);return <tr key={h.id}><td>{a?.asset_tag||'—'}</td><td>{h.activity_type}</td><td>{h.result}</td><td>{fmt(h.performed_at)}</td><td>{fmt(h.next_due_date)}</td></tr>})}</tbody>
    </table>
   </div>
  </>}

  {tab==='workorders'&&<>
   <div className="facility-panel"><h2>{lang==='ar'?'أمر عمل طبي جديد':'New Medical Work Order'}</h2>
    <div className="med-grid">
     <Field label={lang==='ar'?'الجهاز':'Device'}><select value={wo.asset_id} onChange={e=>setWo({...wo,asset_id:e.target.value})}><option value="">Select</option>{orgAssets.map(a=><option value={a.id} key={a.id}>{a.asset_tag} · {typeMap.get(a.master_type_id)?.name_en}</option>)}</select></Field>
     <Field label={lang==='ar'?'النوع':'Type'}><select value={wo.work_type} onChange={e=>setWo({...wo,work_type:e.target.value})}><option>corrective</option><option>preventive</option><option>calibration</option><option>inspection</option></select></Field>
     <Field label={lang==='ar'?'الأولوية':'Priority'}><select value={wo.priority} onChange={e=>setWo({...wo,priority:e.target.value})}><option>low</option><option>normal</option><option>high</option><option>critical</option></select></Field>
     <Field label={lang==='ar'?'الاستحقاق':'Due date'}><input type="date" value={wo.due_date} onChange={e=>setWo({...wo,due_date:e.target.value})}/></Field>
     <Field label={lang==='ar'?'العنوان':'Title'}><input value={wo.title} onChange={e=>setWo({...wo,title:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الوصف':'Description'}><textarea value={wo.description} onChange={e=>setWo({...wo,description:e.target.value})}/></Field>
    </div>
    <button className="btn primary" disabled={busy||!wo.asset_id||!wo.title.trim()} onClick={doWO}>{lang==='ar'?'إنشاء أمر العمل':'Create Work Order'}</button>
   </div>
   <div className="facility-panel"><h2>{lang==='ar'?'أوامر العمل الطبية':'Medical Work Orders'}</h2>
    <table className="facility-table"><thead><tr><th>No.</th><th>{lang==='ar'?'الجهاز':'Device'}</th><th>{lang==='ar'?'النوع':'Type'}</th><th>{lang==='ar'?'العنوان':'Title'}</th><th>{lang==='ar'?'الأولوية':'Priority'}</th><th>{lang==='ar'?'الحالة':'Status'}</th></tr></thead>
     <tbody>{data.workOrders.filter(w=>!org||w.organization_id===org).map(w=>{const a=data.assets.find(x=>x.id===w.asset_id);return <tr key={w.id}><td>{w.work_order_number}</td><td>{a?.asset_tag||'—'}</td><td>{w.work_type}</td><td>{w.title}</td><td>{w.priority}</td><td>{w.status}</td></tr>})}</tbody>
    </table>
   </div>
  </>}

  {tab==='admin'&&access?.super_admin&&<>
   <div className="facility-panel"><h2>{lang==='ar'?'إضافة/تعديل نوع جهاز طبي':'Add / Edit Medical Device Type'}</h2>
    <div className="med-grid">
     <Field label="System"><input value={typeForm.system_code} onChange={e=>setTypeForm({...typeForm,system_code:e.target.value})}/></Field>
     <Field label="Code"><input value={typeForm.code} onChange={e=>setTypeForm({...typeForm,code:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الاسم العربي':'Arabic name'}><input value={typeForm.name_ar} onChange={e=>setTypeForm({...typeForm,name_ar:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الاسم الإنجليزي':'English name'}><input value={typeForm.name_en} onChange={e=>setTypeForm({...typeForm,name_en:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الأيقونة':'Icon'}><input value={typeForm.icon_text} onChange={e=>setTypeForm({...typeForm,icon_text:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الأهمية':'Criticality'}><select value={typeForm.default_criticality} onChange={e=>setTypeForm({...typeForm,default_criticality:e.target.value})}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></Field>
     <Field label="PM months"><input type="number" value={typeForm.default_pm_months} onChange={e=>setTypeForm({...typeForm,default_pm_months:e.target.value})}/></Field>
     <Field label="Calibration months"><input type="number" value={typeForm.default_calibration_months} onChange={e=>setTypeForm({...typeForm,default_calibration_months:e.target.value})}/></Field>
     <Field label="Procurement"><select value={typeForm.procurement_class} onChange={e=>setTypeForm({...typeForm,procurement_class:e.target.value})}><option>standard</option><option>long_lead</option><option>special_order</option></select></Field>
     <Field label="Lead days"><input type="number" value={typeForm.default_lead_time_days} onChange={e=>setTypeForm({...typeForm,default_lead_time_days:e.target.value})}/></Field>
    </div>
    <button className="btn primary" onClick={doType}>{lang==='ar'?'حفظ النوع':'Save Type'}</button>
   </div>
   <div className="facility-panel"><h2>{lang==='ar'?'إضافة شركة مصنعة':'Add Manufacturer'}</h2>
    <div className="med-grid"><Field label="Code"><input value={brandForm.code} onChange={e=>setBrandForm({...brandForm,code:e.target.value})}/></Field><Field label={lang==='ar'?'الاسم':'Name'}><input value={brandForm.name} onChange={e=>setBrandForm({...brandForm,name:e.target.value})}/></Field></div>
    <button className="btn primary" onClick={doBrand}>{lang==='ar'?'حفظ الشركة':'Save Manufacturer'}</button>
   </div>
  </>}
 </section>
}
