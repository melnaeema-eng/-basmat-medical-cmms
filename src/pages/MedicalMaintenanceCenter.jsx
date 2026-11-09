import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import MedicalLibraryDrilldown from '../components/MedicalLibraryDrilldown'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMasterAssetLibrary} from '../lib/masterAssetLibrary'
import {saveMedicalType,saveMedicalManufacturer} from '../lib/medicalMaintenance'
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

const emptyType={id:'',system_code:'GENERAL_MEDICAL',code:'',name_ar:'',name_en:'',icon_text:'🏥',default_criticality:'high',default_pm_months:12,default_calibration_months:12,procurement_class:'standard',default_lead_time_days:45}
const emptyBrand={id:'',code:'',name:''}

export default function MedicalMaintenanceCenter(){
 const {access}=useAuth(),{lang}=useLanguage(),nav=useNavigate()
 const [data,setData]=useState(null),[tab,setTab]=useState('library')
 const [error,setError]=useState(''),[success,setSuccess]=useState('')
 const [query,setQuery]=useState(''),[system,setSystem]=useState('')
 const [selectedLibrary,setSelectedLibrary]=useState(null)
 const [typeForm,setTypeForm]=useState(emptyType),[brandForm,setBrandForm]=useState(emptyBrand)
 const load=async()=>{try{setError('');setData(await loadMasterAssetLibrary())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 useEffect(()=>{if(selectedLibrary)document.getElementById('medical-library-drilldown')?.scrollIntoView({behavior:'smooth',block:'start'})},[selectedLibrary])
 const mfrMap=useMemo(()=>new Map((data?.manufacturers||[]).map(x=>[x.id,x])),[data])
 const systems=useMemo(()=>[...new Set((data?.types||[]).map(x=>x.system_code))].sort(),[data])
 const library=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return (data?.types||[]).filter(t=>t.status!=='archived').filter(t=>{
   const opts=(data.options||[]).filter(o=>o.asset_type_id===t.id&&o.status!=='archived')
   const text=[t.code,t.name_ar,t.name_en,t.system_code,...opts.map(o=>mfrMap.get(o.manufacturer_id)?.name||'')].join(' ').toLowerCase()
   return (!system||t.system_code===system)&&(!q||text.includes(q))
  }).map(t=>({...t,brands:[...new Map((data.options||[]).filter(o=>o.asset_type_id===t.id&&o.status!=='archived').map(o=>mfrMap.get(o.manufacturer_id)).filter(Boolean).map(m=>[m.id,m])).values()]}))
 },[data,query,system,mfrMap])
 const openMedicalManufacturer=(type,manufacturer)=>setSelectedLibrary({type,manufacturer})
 const registerFromLibrary=pick=>nav('/medical-asset-cockpit',{state:{registration:{typeId:pick.type.id,manufacturerId:pick.manufacturer.id,optionId:pick.option?.id||'',model:pick.model||''}}})
 async function doType(){try{setError('');await saveMedicalType(typeForm);setTypeForm(emptyType);await load();setSuccess(lang==='ar'?'تم حفظ نوع الجهاز.':'Device type saved.')}catch(e){setError(e.message)}}
 async function doBrand(){try{setError('');await saveMedicalManufacturer(brandForm);setBrandForm(emptyBrand);await load();setSuccess(lang==='ar'?'تم حفظ الشركة المصنعة.':'Manufacturer saved.')}catch(e){setError(e.message)}}
 if(!data)return <section className="facility-module"><Notice error={error}/><p>{lang==='ar'?'جاري تحميل المكتبة…':'Loading library…'}</p></section>
 return <section className="facility-module" dir={lang==='ar'?'rtl':'ltr'}>
  <style>{`.med-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.med-card{border:1px solid #dfe7ef;border-radius:14px;padding:16px;background:#fff}.med-icon{font-size:26px}.med-badge{display:inline-block;padding:6px 10px;border:1px solid #dfe7ef;border-radius:16px;margin:3px;background:#f7f9fc}`}</style>
  <div className="page-head"><div><h1>{lang==='ar'?'مكتبة الأجهزة الطبية':'Medical Device Library'}</h1><p>{lang==='ar'?'اختر نوع الجهاز والمصنع والموديل، ثم سجّل الجهاز لبدء صيانته.':'Choose a device type, manufacturer and model, then register it to begin maintenance.'}</p></div><button className="btn primary" onClick={()=>nav('/medical-asset-cockpit')}>{lang==='ar'?'الأجهزة والصيانة':'Devices & Maintenance'}</button></div>
  <Notice error={error} success={success}/>
  {access?.super_admin&&<div className="row-actions"><button className="btn" onClick={()=>setTab('library')}>{lang==='ar'?'المكتبة':'Library'}</button><button className="btn" onClick={()=>setTab('admin')}>{lang==='ar'?'إدارة المكتبة':'Library Admin'}</button></div>}
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
     <div style={{fontSize:10,marginTop:6}}><b>{lang==='ar'?'المصنعون':'Brands'}:</b> {t.brands.slice(0,8).map(b=><button type="button" className="med-badge" key={b.id} style={{cursor:'pointer',pointerEvents:'auto',position:'relative',zIndex:2}} onClick={()=>openMedicalManufacturer(t,b)}>{b.name}</button>)}</div>
    </div>)}</div>
   </div>)}
  </>}

   {selectedLibrary&&<MedicalLibraryDrilldown
  lang={lang}
  selection={selectedLibrary}
  options={data.options||[]}
  onRegister={registerFromLibrary}
 />}
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
