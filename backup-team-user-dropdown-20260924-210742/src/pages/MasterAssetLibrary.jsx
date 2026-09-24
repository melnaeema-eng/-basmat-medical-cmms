import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMasterAssetLibrary,adoptMasterTemplates,saveMasterAsset,saveMasterManufacturer,saveMasterOption,saveMasterTemplate,saveMasterStep,setMasterActive} from '../lib/masterAssetLibrary'
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
 HEALTHCARE:['أنظمة الأجهزة الطبية الصحية','Healthcare Facility Systems'],
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
 const [adminOpen,setAdminOpen]=useState(false),[adminTab,setAdminTab]=useState('asset')
  const focusAdmin=(tab)=>{
   if(tab)setAdminTab(tab)
   setAdminOpen(true)
   window.setTimeout(()=>document.getElementById('master-library-admin')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
  }
 const emptyAsset={id:'',system_code:'GENERAL',code:'',name_ar:'',name_en:'',icon_text:'🔧',group_ar:'',group_en:'',description_ar:'',description_en:'',default_criticality:'medium',expected_life_years:'',procurement_class:'standard',default_lead_time_days:'',critical_spare:false,stock_strategy:''}
 const emptyBrand={id:'',code:'',name:'',short_name:'',website:''}
 const emptyOption={id:'',asset_type_id:'',manufacturer_id:'',model_family:'',notes:''}
 const emptyTemplate={id:'',asset_type_id:'',manufacturer_id:'',title_ar:'',title_en:'',frequency:'monthly',estimated_minutes:60,reference:''}
 const emptyStep={id:'',template_id:'',seq:1,title_ar:'',title_en:'',instructions_ar:'',instructions_en:'',task_type:'inspection',response_type:'pass_fail',unit:'',safety_notes:'',tools:'',materials:''}
 const [assetForm,setAssetForm]=useState(emptyAsset),[brandForm,setBrandForm]=useState(emptyBrand),[optionForm,setOptionForm]=useState(emptyOption),[templateForm,setTemplateForm]=useState(emptyTemplate),[stepForm,setStepForm]=useState(emptyStep)
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

 const saveAdmin=async(kind)=>{
  try{
   setBusy(true);setError('');setSuccess('')
   if(kind==='asset')await saveMasterAsset(assetForm)
   if(kind==='brand')await saveMasterManufacturer(brandForm)
   if(kind==='option')await saveMasterOption(optionForm)
   if(kind==='template')await saveMasterTemplate(templateForm)
   if(kind==='step')await saveMasterStep(stepForm)
   setSuccess(lang==='ar'?'تم حفظ المكتبة بنجاح.':'Master library saved successfully.')
   if(kind==='asset')setAssetForm(emptyAsset)
   if(kind==='brand')setBrandForm(emptyBrand)
   if(kind==='option')setOptionForm(emptyOption)
   if(kind==='template')setTemplateForm(emptyTemplate)
   if(kind==='step')setStepForm(emptyStep)
   await load()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const editAsset=x=>{setAssetForm({...emptyAsset,...x,expected_life_years:x.expected_life_years||'',default_lead_time_days:x.default_lead_time_days||''});focusAdmin('asset')}
 const editBrand=x=>{setBrandForm({...emptyBrand,...x});focusAdmin('brand')}
 const editOption=x=>{setOptionForm({...emptyOption,...x});focusAdmin('option')}
 const editTemplate=x=>{setTemplateForm({...emptyTemplate,...x});focusAdmin('template')}
 const editStep=x=>{setStepForm({...emptyStep,...x});focusAdmin('step')}

 const archiveAdmin=async(entity,id,active=false)=>{
  if(!confirm(lang==='ar'?(active?'إعادة تفعيل هذا العنصر؟':'أرشفة هذا العنصر؟'):(active?'Reactivate this item?':'Archive this item?')))return
  try{setBusy(true);setError('');await setMasterActive(entity,id,active);await load();setSuccess(lang==='ar'?'تم تحديث الحالة.':'Status updated.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }

 return <section className="facility-module asset-library-print">
  <style>{`
   .asset-lib-icon{width:34px;height:34px;border-radius:10px;background:#f3f7fb;display:inline-flex;align-items:center;justify-content:center;font-size:19px;flex:0 0 34px}
   .asset-brand{display:inline-block;border:1px solid #dfe7ef;border-radius:999px;padding:3px 7px;margin:2px;font-size:10px;background:#fff;white-space:nowrap}
   .asset-group-title{display:flex;align-items:center;gap:8px;margin:18px 0 8px;color:#0b2b4b}
   .master-admin-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
   .master-admin-tabs button{padding:7px 10px}
   .master-admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
   .master-admin-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
   .asset-admin-mini{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
   .asset-admin-mini button{font-size:10px;padding:4px 7px}
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
     ?'تغطية موسعة لأنظمة الأجهزة الطبية مع العلامات التجارية الشائعة وقوالب PPM وأيقونات صغيرة للعرض والطباعة.'
     :'Expanded facility systems with common brands, PPM templates, and compact icons for screen and print.'}</p>
   </div>
   <div className="no-print" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {access?.super_admin&&<button className="btn primary" onClick={()=>{if(adminOpen)setAdminOpen(false);else focusAdmin(adminTab)}}>{lang==='ar'?'⚙️ إدارة المكتبة':'⚙️ Manage Library'}</button>}
    <button className="btn" onClick={()=>window.print()}>{lang==='ar'?'🖨️ طباعة / حفظ PDF':'🖨️ Print / Save PDF'}</button>
   </div>
  </div>

  <Notice error={error} success={success}/>

  {access?.super_admin&&adminOpen&&data&&<div id="master-library-admin" className="facility-panel no-print" style={{marginBottom:14,scrollMarginTop:18}}>
   <h2 style={{marginTop:0}}>{lang==='ar'?'إدارة المكتبة المركزية — Super Admin':'Master Library Administration — Super Admin'}</h2>
   <p style={{fontSize:11,color:'#617083'}}>{lang==='ar'?'الإضافات والتعديلات هنا تصبح متاحة لجميع المنظمات. استخدم الأرشفة بدلاً من الحذف للسجلات المستخدمة.':'Changes here become available to all organizations. Archive used records instead of deleting them.'}</p>
   <div className="master-admin-tabs">
    {[['asset','الأصل','Asset'],['brand','العلامة','Brand'],['option','الموديل','Model'],['template','قالب PPM','PPM Template'],['step','خطوة PPM','PPM Step']].map(x=>
     <button key={x[0]} className={'btn '+(adminTab===x[0]?'primary':'')} onClick={()=>setAdminTab(x[0])}>{lang==='ar'?x[1]:x[2]}</button>)}
   </div>

   {adminTab==='asset'&&<>
    <div className="master-admin-grid">
     <Field label="System"><input value={assetForm.system_code} onChange={e=>setAssetForm({...assetForm,system_code:e.target.value})}/></Field>
     <Field label="Code"><input value={assetForm.code} onChange={e=>setAssetForm({...assetForm,code:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الاسم العربي':'Arabic name'}><input value={assetForm.name_ar} onChange={e=>setAssetForm({...assetForm,name_ar:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الاسم الإنجليزي':'English name'}><input value={assetForm.name_en} onChange={e=>setAssetForm({...assetForm,name_en:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الأيقونة':'Icon'}><input value={assetForm.icon_text} onChange={e=>setAssetForm({...assetForm,icon_text:e.target.value})}/></Field>
     <Field label={lang==='ar'?'المجموعة عربي':'Arabic group'}><input value={assetForm.group_ar||''} onChange={e=>setAssetForm({...assetForm,group_ar:e.target.value})}/></Field>
     <Field label={lang==='ar'?'المجموعة English':'English group'}><input value={assetForm.group_en||''} onChange={e=>setAssetForm({...assetForm,group_en:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الأهمية':'Criticality'}><select value={assetForm.default_criticality} onChange={e=>setAssetForm({...assetForm,default_criticality:e.target.value})}><option>low</option><option>medium</option><option>high</option><option>critical</option></select></Field>
     <Field label={lang==='ar'?'العمر المتوقع/سنة':'Expected life / years'}><input type="number" min="1" value={assetForm.expected_life_years} onChange={e=>setAssetForm({...assetForm,expected_life_years:e.target.value})}/></Field>
     <Field label={lang==='ar'?'التوريد':'Procurement'}><select value={assetForm.procurement_class} onChange={e=>setAssetForm({...assetForm,procurement_class:e.target.value})}><option value="standard">standard</option><option value="long_lead">long_lead</option><option value="special_order">special_order</option></select></Field>
     <Field label={lang==='ar'?'Lead Time / يوم':'Lead time / days'}><input type="number" min="1" value={assetForm.default_lead_time_days} onChange={e=>setAssetForm({...assetForm,default_lead_time_days:e.target.value})}/></Field>
     <Field label={lang==='ar'?'قطعة حرجة':'Critical spare'}><label style={{display:'flex',gap:7,alignItems:'center',paddingTop:8}}><input type="checkbox" checked={!!assetForm.critical_spare} onChange={e=>setAssetForm({...assetForm,critical_spare:e.target.checked})}/>{lang==='ar'?'نعم':'Yes'}</label></Field>
    </div>
    <div className="master-admin-grid" style={{marginTop:8}}>
     <Field label={lang==='ar'?'الوصف العربي':'Arabic description'}><textarea value={assetForm.description_ar||''} onChange={e=>setAssetForm({...assetForm,description_ar:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الوصف الإنجليزي':'English description'}><textarea value={assetForm.description_en||''} onChange={e=>setAssetForm({...assetForm,description_en:e.target.value})}/></Field>
     <Field label={lang==='ar'?'استراتيجية المخزون':'Stock strategy'}><textarea value={assetForm.stock_strategy||''} onChange={e=>setAssetForm({...assetForm,stock_strategy:e.target.value})}/></Field>
    </div>
    <div className="master-admin-actions"><button className="btn primary" disabled={busy} onClick={()=>saveAdmin('asset')}>{assetForm.id?(lang==='ar'?'حفظ التعديل':'Save changes'):(lang==='ar'?'+ إضافة أصل':'+ Add asset')}</button><button className="btn" onClick={()=>setAssetForm(emptyAsset)}>{lang==='ar'?'جديد':'New'}</button></div>
   </>}

   {adminTab==='brand'&&<>
    <div className="master-admin-grid">
     <Field label="Code"><input value={brandForm.code} onChange={e=>setBrandForm({...brandForm,code:e.target.value})}/></Field>
     <Field label={lang==='ar'?'اسم العلامة':'Brand name'}><input value={brandForm.name} onChange={e=>setBrandForm({...brandForm,name:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الاسم المختصر':'Short name'}><input value={brandForm.short_name||''} onChange={e=>setBrandForm({...brandForm,short_name:e.target.value})}/></Field>
     <Field label="Website"><input value={brandForm.website||''} onChange={e=>setBrandForm({...brandForm,website:e.target.value})}/></Field>
    </div>
    <div className="master-admin-actions"><button className="btn primary" disabled={busy} onClick={()=>saveAdmin('brand')}>{brandForm.id?(lang==='ar'?'حفظ التعديل':'Save changes'):(lang==='ar'?'+ إضافة علامة':'+ Add brand')}</button><button className="btn" onClick={()=>setBrandForm(emptyBrand)}>{lang==='ar'?'جديد':'New'}</button></div>
    <div style={{marginTop:10,maxHeight:220,overflow:'auto'}}>{data.manufacturers.map(x=><div key={x.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'5px 0',borderBottom:'1px solid #edf1f5'}}><span>{x.name} <small>({x.code})</small></span><span><button className="btn" onClick={()=>editBrand(x)}>{lang==='ar'?'تعديل':'Edit'}</button> <button className="btn" onClick={()=>archiveAdmin('manufacturer',x.id,x.status!=='active')}>{x.status==='active'?(lang==='ar'?'أرشفة':'Archive'):(lang==='ar'?'تفعيل':'Activate')}</button></span></div>)}</div>
   </>}

   {adminTab==='option'&&<>
    <div className="master-admin-grid">
     <Field label={lang==='ar'?'الأصل':'Asset'}><select value={optionForm.asset_type_id} onChange={e=>setOptionForm({...optionForm,asset_type_id:e.target.value})}><option value="">{lang==='ar'?'اختر':'Select'}</option>{data.types.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.icon_text||'🔧'} {x.name_en}</option>)}</select></Field>
     <Field label={lang==='ar'?'العلامة':'Brand'}><select value={optionForm.manufacturer_id} onChange={e=>setOptionForm({...optionForm,manufacturer_id:e.target.value})}><option value="">{lang==='ar'?'اختر':'Select'}</option>{data.manufacturers.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></Field>
     <Field label="Model / Series"><input value={optionForm.model_family||''} onChange={e=>setOptionForm({...optionForm,model_family:e.target.value})}/></Field>
     <Field label={lang==='ar'?'ملاحظات':'Notes'}><input value={optionForm.notes||''} onChange={e=>setOptionForm({...optionForm,notes:e.target.value})}/></Field>
    </div>
    <div className="master-admin-actions"><button className="btn primary" disabled={busy} onClick={()=>saveAdmin('option')}>{optionForm.id?(lang==='ar'?'حفظ التعديل':'Save changes'):(lang==='ar'?'+ إضافة موديل':'+ Add model')}</button><button className="btn" onClick={()=>setOptionForm(emptyOption)}>{lang==='ar'?'جديد':'New'}</button></div>
   </>}

   {adminTab==='template'&&<>
    <div className="master-admin-grid">
     <Field label={lang==='ar'?'الأصل':'Asset'}><select value={templateForm.asset_type_id} onChange={e=>setTemplateForm({...templateForm,asset_type_id:e.target.value})}><option value="">Select</option>{data.types.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.name_en}</option>)}</select></Field>
     <Field label={lang==='ar'?'العلامة - اختياري':'Brand - optional'}><select value={templateForm.manufacturer_id||''} onChange={e=>setTemplateForm({...templateForm,manufacturer_id:e.target.value})}><option value="">{lang==='ar'?'عام':'Generic'}</option>{data.manufacturers.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></Field>
     <Field label={lang==='ar'?'العنوان العربي':'Arabic title'}><input value={templateForm.title_ar} onChange={e=>setTemplateForm({...templateForm,title_ar:e.target.value})}/></Field>
     <Field label={lang==='ar'?'العنوان الإنجليزي':'English title'}><input value={templateForm.title_en} onChange={e=>setTemplateForm({...templateForm,title_en:e.target.value})}/></Field>
     <Field label={lang==='ar'?'التكرار':'Frequency'}><select value={templateForm.frequency} onChange={e=>setTemplateForm({...templateForm,frequency:e.target.value})}>{['daily','weekly','monthly','quarterly','semiannual','annual'].map(x=><option key={x}>{x}</option>)}</select></Field>
     <Field label={lang==='ar'?'المدة/دقيقة':'Minutes'}><input type="number" min="1" value={templateForm.estimated_minutes} onChange={e=>setTemplateForm({...templateForm,estimated_minutes:e.target.value})}/></Field>
     <Field label={lang==='ar'?'المرجع':'Reference'}><input value={templateForm.reference||''} onChange={e=>setTemplateForm({...templateForm,reference:e.target.value})}/></Field>
    </div>
    <div className="master-admin-actions"><button className="btn primary" disabled={busy} onClick={()=>saveAdmin('template')}>{templateForm.id?(lang==='ar'?'حفظ التعديل':'Save changes'):(lang==='ar'?'+ إضافة قالب':'+ Add template')}</button><button className="btn" onClick={()=>setTemplateForm(emptyTemplate)}>{lang==='ar'?'جديد':'New'}</button></div>
    <div style={{marginTop:10,maxHeight:240,overflow:'auto'}}>{data.templates.map(x=><div key={x.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'5px 0',borderBottom:'1px solid #edf1f5'}}><span>{x.title_en} · {x.frequency}</span><span><button className="btn" onClick={()=>editTemplate(x)}>{lang==='ar'?'تعديل':'Edit'}</button> <button className="btn" onClick={()=>archiveAdmin('template',x.id,x.status!=='active')}>{x.status==='active'?(lang==='ar'?'أرشفة':'Archive'):(lang==='ar'?'تفعيل':'Activate')}</button></span></div>)}</div>
   </>}

   {adminTab==='step'&&<>
    <div className="master-admin-grid">
     <Field label={lang==='ar'?'قالب PPM':'PPM template'}><select value={stepForm.template_id} onChange={e=>setStepForm({...stepForm,template_id:e.target.value})}><option value="">Select</option>{data.templates.filter(x=>x.status==='active').map(x=><option value={x.id} key={x.id}>{x.title_en}</option>)}</select></Field>
     <Field label={lang==='ar'?'الترتيب':'Sequence'}><input type="number" min="1" value={stepForm.seq} onChange={e=>setStepForm({...stepForm,seq:e.target.value})}/></Field>
     <Field label={lang==='ar'?'عنوان الخطوة عربي':'Arabic step title'}><input value={stepForm.title_ar} onChange={e=>setStepForm({...stepForm,title_ar:e.target.value})}/></Field>
     <Field label={lang==='ar'?'عنوان الخطوة English':'English step title'}><input value={stepForm.title_en} onChange={e=>setStepForm({...stepForm,title_en:e.target.value})}/></Field>
     <Field label="Task type"><select value={stepForm.task_type} onChange={e=>setStepForm({...stepForm,task_type:e.target.value})}>{['inspection','cleaning','lubrication','adjustment','test','replacement','safety','other'].map(x=><option key={x}>{x}</option>)}</select></Field>
     <Field label="Response"><select value={stepForm.response_type} onChange={e=>setStepForm({...stepForm,response_type:e.target.value})}>{['pass_fail','reading','text'].map(x=><option key={x}>{x}</option>)}</select></Field>
     <Field label={lang==='ar'?'الوحدة':'Unit'}><input value={stepForm.unit||''} onChange={e=>setStepForm({...stepForm,unit:e.target.value})}/></Field>
    </div>
    <div className="master-admin-grid" style={{marginTop:8}}>
     <Field label={lang==='ar'?'التعليمات عربي':'Arabic instructions'}><textarea value={stepForm.instructions_ar||''} onChange={e=>setStepForm({...stepForm,instructions_ar:e.target.value})}/></Field>
     <Field label={lang==='ar'?'التعليمات English':'English instructions'}><textarea value={stepForm.instructions_en||''} onChange={e=>setStepForm({...stepForm,instructions_en:e.target.value})}/></Field>
     <Field label={lang==='ar'?'السلامة':'Safety'}><textarea value={stepForm.safety_notes||''} onChange={e=>setStepForm({...stepForm,safety_notes:e.target.value})}/></Field>
     <Field label={lang==='ar'?'الأدوات':'Tools'}><textarea value={stepForm.tools||''} onChange={e=>setStepForm({...stepForm,tools:e.target.value})}/></Field>
     <Field label={lang==='ar'?'المواد':'Materials'}><textarea value={stepForm.materials||''} onChange={e=>setStepForm({...stepForm,materials:e.target.value})}/></Field>
    </div>
    <div className="master-admin-actions"><button className="btn primary" disabled={busy} onClick={()=>saveAdmin('step')}>{stepForm.id?(lang==='ar'?'حفظ التعديل':'Save changes'):(lang==='ar'?'+ إضافة خطوة':'+ Add step')}</button><button className="btn" onClick={()=>setStepForm(emptyStep)}>{lang==='ar'?'جديد':'New'}</button></div>
    <div style={{marginTop:10,maxHeight:250,overflow:'auto'}}>{data.steps.filter(x=>!stepForm.template_id||x.template_id===stepForm.template_id).sort((a,b)=>a.seq-b.seq).slice(0,100).map(x=><div key={x.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'5px 0',borderBottom:'1px solid #edf1f5'}}><span>{x.seq}. {x.title_en}</span><button className="btn" onClick={()=>editStep(x)}>{lang==='ar'?'تعديل':'Edit'}</button></div>)}</div>
   </>}
  </div>}

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
     <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Philips / GE / Siemens / Drager / Ventilator / Monitor / Ultrasound..."/>
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
        ?t.options.slice(0,12).map(o=><button type="button" className="asset-brand" key={o.id} title={o.model_family||''} onClick={()=>{setManufacturer(o.manufacturer_id);setQuery(o.model_family||'');window.scrollTo({top:0,behavior:'smooth'})}}>{o.manufacturer?.name||''}{o.model_family?` - ${o.model_family}`:''}</button>)
        :<span>{lang==='ar'?'OEM / عام':'OEM / Generic'}</span>}
      </div>

      <div style={{marginTop:7,fontSize:10}}>
       <b>{lang==='ar'?'الصيانة الدورية':'Preventive maintenance'}:</b>{' '}
       {t.templates.length
        ?t.templates.map(p=>`${lang==='ar'?p.title_ar:p.title_en} (${p.frequency})`).join(' | ')
        :(lang==='ar'?'قالب عام حسب دليل المصنع':'Generic OEM-based template')}
      </div>
      {access?.super_admin&&<div className="asset-admin-mini no-print">
       <button className="btn" onClick={()=>editAsset(t)}>✏️ {lang==='ar'?'تعديل الأصل':'Edit asset'}</button>
       <button className="btn" onClick={()=>{setOptionForm({...emptyOption,asset_type_id:t.id});focusAdmin('option')}}>🏷️ {lang==='ar'?'إضافة علامة/موديل':'Add brand/model'}</button>
       <button className="btn" onClick={()=>{setTemplateForm({...emptyTemplate,asset_type_id:t.id});focusAdmin('template')}}>🛠️ {lang==='ar'?'إضافة PPM':'Add PPM'}</button>
       <button className="btn" onClick={()=>archiveAdmin('asset',t.id,t.status!=='active')}>{t.status==='active'?'🗄️ '+(lang==='ar'?'أرشفة':'Archive'):'✅ '+(lang==='ar'?'تفعيل':'Activate')}</button>
       {t.options.slice(0,3).map(o=><button key={o.id} className="btn" onClick={()=>editOption(o)}>✏️ {o.manufacturer?.short_name||o.manufacturer?.name||'Model'}</button>)}
      </div>}
     </article>)}
    </div>
   </div>)}
  </>}
 </section>
}
