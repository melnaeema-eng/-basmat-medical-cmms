import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMasterAssetLibrary,adoptMasterTemplates} from '../lib/masterAssetLibrary'
import {Field,Notice} from '../components/FacilityFields'

const systemLabels={
 HVAC:['التكييف والتهوية','HVAC & Ventilation'],
 BMS:['إدارة المباني والتحكم','BMS & Controls'],
 FIRE_ALARM:['إنذار الحريق','Fire Alarm'],
 FIRE_SUPPRESSION:['مكافحة وإطفاء الحريق','Fire Fighting & Suppression'],
 ELECTRICAL:['الأنظمة الكهربائية','Electrical'],
 ENERGY:['الطاقة والاستدامة','Energy & Sustainability'],
 PLUMBING:['السباكة والمياه','Plumbing'],
 WATER:['معالجة المياه','Water Treatment'],
 IRRIGATION:['الري والمناظر الطبيعية','Irrigation & Landscape'],
 VERTICAL:['النقل الرأسي','Vertical Transportation'],
 SECURITY:['الأمن والمراقبة','Security & CCTV'],
 ELV:['الأنظمة منخفضة التيار','ELV / AV'],
 ICT:['الشبكات والاتصالات','ICT & Networks'],
 DATACENTER:['مراكز البيانات','Data Center'],
 PARKING:['المواقف','Parking'],
 GENERAL:['الأبواب والعناصر المعمارية','Doors & Architectural'],
 KITCHEN:['معدات المطابخ','Commercial Kitchen'],
 LAUNDRY:['معدات المغاسل','Laundry'],
 GAS:['الغاز والوقود','Gas & Fuel'],
 POOL:['المسابح والنوافير','Pools & Fountains'],
 HEALTHCARE:['أنظمة المرافق الصحية','Healthcare Facility Systems'],
 PUBLIC:['مرافق عامة خاصة','Public Facility Systems'],
 TELEPHONY:['السنترالات والهواتف','Telephony & Unified Communications'],
 UC_AV:['المؤتمرات المرئية والصوتية','Unified Communications & AV'],
 RADIO:['الاتصالات اللاسلكية','Two-Way Radio Communications'],
 WIRELESS:['الروابط والشبكات اللاسلكية','Wireless Communications'],
 DAS:['التغطية الخلوية الداخلية DAS','In-Building Cellular / DAS'],
 PAGA:['النداء العام والاتصال الحرج','PAGA / Critical Communications'],
 STRUCTURED_CABLING:['البنية التحتية للاتصالات','Structured Cabling'],
 CLOCK_PAGING:['الساعات المركزية والنداء','Master Clock & Paging'],
 LONG_LEAD_COMPONENT:['مكونات حرجة طويلة التوريد','Critical Long Lead Components'],
 AV:['الأوديو والفيديو والشاشات','Audio Video & Display Systems'],
 IT:['أجهزة تقنية المعلومات','IT Endpoints & Compute'],
 OFFICE:['الطباعة والنسخ والأجهزة المكتبية','Printing, Copying & Office Equipment']
}

export default function MasterAssetLibrary(){
 const {can,access}=useAuth(),{lang}=useLanguage()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [system,setSystem]=useState(''),[type,setType]=useState(''),[manufacturer,setManufacturer]=useState(''),[org,setOrg]=useState(''),[query,setQuery]=useState(''),[longLeadOnly,setLongLeadOnly]=useState(false),[busy,setBusy]=useState(false)
 const load=async()=>{try{setError('');setData(await loadMasterAssetLibrary())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])

 const systems=useMemo(()=>[...new Set((data?.types||[]).map(x=>x.system_code))].sort(),[data])
 const manufacturerById=useMemo(()=>new Map((data?.manufacturers||[]).map(x=>[x.id,x])),[data])

 const rows=useMemo(()=>{
  if(!data)return[]
  return data.types
   .filter(t=>{
    const opts=data.options.filter(o=>o.asset_type_id===t.id)
    const manufacturerMatch=!manufacturer||opts.some(o=>o.manufacturer_id===manufacturer)
    const text=[t.code,t.name_ar,t.name_en,t.system_code,t.group_ar,t.group_en,
     ...opts.map(o=>manufacturerById.get(o.manufacturer_id)?.name||''),
     ...opts.map(o=>o.model_family||'')].join(' ').toLowerCase()
    return (!system||t.system_code===system)&&(!type||t.id===type)&&manufacturerMatch&&(!longLeadOnly||t.procurement_class==='long_lead')&&(!query||text.includes(query.toLowerCase()))
   })
   .map(t=>({
    ...t,
    options:data.options.filter(o=>o.asset_type_id===t.id).map(o=>({...o,manufacturer:manufacturerById.get(o.manufacturer_id)})),
    templates:data.templates.filter(p=>p.asset_type_id===t.id)
   }))
 },[data,system,type,manufacturer,query,longLeadOnly,manufacturerById])

 const grouped=useMemo(()=>{
  const out={}
  for(const row of rows)(out[row.system_code]??=[]).push(row)
  return out
 },[rows])

 const allowedOrgs=useMemo(()=>{
  if(!data)return[]
  if(access?.super_admin)return data.organizations
  const ids=new Set((access?.roles||[]).filter(r=>r.permission==='assets.manage').map(r=>r.organization_id))
  return data.organizations.filter(o=>ids.has(o.id))
 },[data,access])

 const adopt=async t=>{
  if(!org)return setError(lang==='ar'?'اختر المنظمة أولاً':'Select organization first')
  try{
   setBusy(true);setError('');setSuccess('')
   const r=await adoptMasterTemplates(org,t.id,manufacturer||null)
   setSuccess(lang==='ar'
    ?`${t.icon_text||'🔧'} تم تجهيز ${t.name_ar} للمنظمة وإنشاء ${r?.procedures_created||0} برنامج صيانة.`
    :`${t.icon_text||'🔧'} ${t.name_en} prepared; ${r?.procedures_created||0} maintenance procedures created.`)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 return <section className="facility-module asset-library-print">
  <style>{`
   .asset-lib-icon{width:34px;height:34px;border-radius:10px;background:#f3f7fb;display:inline-flex;align-items:center;justify-content:center;font-size:19px;flex:0 0 34px}
   .asset-brand{display:inline-block;border:1px solid #dfe7ef;border-radius:999px;padding:3px 7px;margin:2px;font-size:10px;background:#fff;white-space:nowrap}
   .asset-group-title{display:flex;align-items:center;gap:8px;margin:18px 0 8px;color:#0b2b4b}
   @media print{
    .app-sidebar,.bafm-topbar,.filter-grid,.no-print,button{display:none!important}
    .bafm-main,.bafm-content{margin:0!important;padding:0!important}
    .facility-panel{break-inside:avoid;box-shadow:none!important;border:1px solid #ddd!important}
    .asset-library-print{font-size:10px}
   }
  `}</style>

  <div className="page-head">
   <div>
    <h1>{lang==='ar'?'مكتبة الأصول والصيانة — مرافق السعودية':'Asset & Maintenance Library — Saudi Facilities'}</h1>
    <p>{lang==='ar'
     ?'تغطية موسعة لأنظمة المرافق مع العلامات التجارية الشائعة وقوالب PPM وأيقونات صغيرة للعرض والطباعة.'
     :'Expanded facility systems with common brands, PPM templates, and compact icons for screen and print.'}</p>
   </div>
   <button className="btn no-print" onClick={()=>window.print()}>{lang==='ar'?'🖨️ طباعة / حفظ PDF':'🖨️ Print / Save PDF'}</button>
  </div>

  <Notice error={error} success={success}/>

  {data&&<>
   <div className="stats-grid facility-stats">
    <div className="stat-card"><span>{lang==='ar'?'أنواع الأصول':'Asset types'}</span><strong>{data.types.length}</strong></div>
    <div className="stat-card"><span>{lang==='ar'?'العلامات التجارية':'Brands'}</span><strong>{data.manufacturers.length}</strong></div>
    <div className="stat-card"><span>{lang==='ar'?'قوالب الصيانة':'PPM templates'}</span><strong>{data.templates.length}</strong></div>
    <div className="stat-card"><span>{lang==='ar'?'الأنظمة':'Systems'}</span><strong>{systems.length}</strong></div>
   </div>

   <div className="facility-panel filter-grid no-print">
    <Field label={lang==='ar'?'النظام':'System'}>
     <select value={system} onChange={e=>{setSystem(e.target.value);setType('')}}>
      <option value="">{lang==='ar'?'الكل':'All'}</option>
      {systems.map(x=><option key={x} value={x}>{lang==='ar'?(systemLabels[x]?.[0]||x):(systemLabels[x]?.[1]||x)}</option>)}
     </select>
    </Field>

    <Field label={lang==='ar'?'نوع الأصل':'Asset type'}>
     <select value={type} onChange={e=>setType(e.target.value)}>
      <option value="">{lang==='ar'?'الكل':'All'}</option>
      {data.types.filter(x=>!system||x.system_code===system).map(x=>
       <option value={x.id} key={x.id}>{x.icon_text||'🔧'} {lang==='ar'?x.name_ar:x.name_en}</option>)}
     </select>
    </Field>

    <Field label={lang==='ar'?'العلامة التجارية':'Brand'}>
     <select value={manufacturer} onChange={e=>setManufacturer(e.target.value)}>
      <option value="">{lang==='ar'?'كل العلامات / عام':'All brands / generic'}</option>
      {data.manufacturers.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
     </select>
    </Field>

    <Field label={lang==='ar'?'المنظمة':'Organization'}>
     <select value={org} onChange={e=>setOrg(e.target.value)}>
      <option value="">{lang==='ar'?'اختر':'Select'}</option>
      {allowedOrgs.map(x=><option value={x.id} key={x.id}>{x.name_ar||x.name_en||x.name||x.code}</option>)}
     </select>
    </Field>

    <Field label={lang==='ar'?'بحث':'Search'}>
     <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Avaya / Cisco / Radio / DAS / Zamil / FM-200 / Chiller..."/>
    </Field>
    <Field label={lang==='ar'?'التوريد':'Procurement'}>
     <label style={{display:'flex',gap:7,alignItems:'center',paddingTop:8}}>
      <input type="checkbox" checked={longLeadOnly} onChange={e=>setLongLeadOnly(e.target.checked)}/>
      {lang==='ar'?'Long Lead فقط':'Long Lead only'}
     </label>
    </Field>
   </div>

   {Object.entries(grouped).map(([sys,items])=><div key={sys}>
    <h2 className="asset-group-title">
     <span>{items[0]?.icon_text||'🔧'}</span>
     <span>{lang==='ar'?(systemLabels[sys]?.[0]||items[0]?.group_ar||sys):(systemLabels[sys]?.[1]||items[0]?.group_en||sys)}</span>
     <small style={{fontWeight:500,color:'#718096'}}>({items.length})</small>
    </h2>

    <div style={{display:'grid',gap:10}}>
     {items.map(t=><article className="facility-panel" key={t.id}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
       <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <span className="asset-lib-icon" aria-hidden="true">{t.icon_text||'🔧'}</span>
        <div>
         <div style={{fontSize:10,color:'#607087',fontWeight:800}}>{t.code}</div>
         <h3 style={{margin:'3px 0',color:'#0b2b4b'}}>{lang==='ar'?t.name_ar:t.name_en}</h3>
         <div style={{fontSize:10}}>
          {lang==='ar'?'الأهمية':'Criticality'}: <b>{t.default_criticality}</b>
          {t.expected_life_years?` · ${lang==='ar'?'العمر المتوقع':'Expected life'}: ${t.expected_life_years} ${lang==='ar'?'سنة':'yr'}`:''}
          {t.procurement_class==='long_lead'?<span className="asset-brand" style={{fontWeight:800}}>⏳ Long Lead · {t.default_lead_time_days||'?'} {lang==='ar'?'يوم':'days'}</span>:null}
          {t.critical_spare?<span className="asset-brand">📦 {lang==='ar'?'قطعة حرجة':'Critical spare'}</span>:null}
         </div>
        </div>
       </div>
       {can('assets.manage',org||null)&&
        <button className="btn primary no-print" disabled={busy||!org} onClick={()=>adopt(t)}>
         {lang==='ar'?'اعتماد للمنظمة':'Adopt for organization'}
        </button>}
      </div>

      <div style={{marginTop:9,fontSize:11}}>
       <b>{lang==='ar'?'العلامات التجارية المحتملة':'Common brands'}:</b>{' '}
       {t.options.length
        ?t.options.slice(0,12).map(o=><span className="asset-brand" key={o.id} title={o.model_family||''}>{o.manufacturer?.name||''}{o.model_family?` · ${o.model_family}`:''}</span>)
        :<span>{lang==='ar'?'OEM / عام':'OEM / Generic'}</span>}
      </div>

      <div style={{marginTop:7,fontSize:10}}>
       <b>{lang==='ar'?'الصيانة الدورية':'Preventive maintenance'}:</b>{' '}
       {t.templates.length
        ?t.templates.map(p=>`${lang==='ar'?p.title_ar:p.title_en} (${p.frequency})`).join(' | ')
        :(lang==='ar'?'قالب عام حسب دليل المصنع':'Generic OEM-based template')}
      </div>
     </article>)}
    </div>
   </div>)}
  </>}
 </section>
}
