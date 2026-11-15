import {companyWebDraft,companySourceLinks} from '../lib/companyWebLookup'
import {useState,useEffect} from 'react'
import MedicalCompanyRelationships from './MedicalCompanyRelationships'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {
 medicalLibrarySearch,medicalCompanySmartLookup,medicalLibrarySave,
 createOrLinkMedicalTenant,medRelationshipBundle
} from '../lib/medicalKnowledgeLibrary'

const blank={
 id:null,name_ar:'',name_en:'',company_type:'maintenance_company',website:'',
 registration_no:'',vat_no:'',email:'',phone:'',city:'',address:'',
 logo_url:'',logo_source:'',specialties:[],manufacturers:[],notes:'',
 source_type:'manual',source_reference:'',confidence:null
}

export default function MedicalKnowledgeLibraryOnboarding(){
 const {profile}=useAuth()
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const [query,setQuery]=useState(''),[website,setWebsite]=useState(''),[webCandidates,setWebCandidates]=useState([])
 const [results,setResults]=useState([])
 const [form,setForm]=useState(blank)
 const [tenant,setTenant]=useState(null)
 const restoreMedicalKnowledgeTenant=()=>{
  try{
   const raw=localStorage.getItem('basmat.medical.knowledgeTenant')
   if(!raw)return
   const saved=JSON.parse(raw)
   if(saved?.organization_id)setTenant(saved)
  }catch{}
 }

 useEffect(()=>{restoreMedicalKnowledgeTenant()},[])
 const [bundle,setBundle]=useState({clients:[],sites:[],projects:[],assets:[]})
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [ok,setOk]=useState('')

 const isSuper=!!profile?.is_super_admin

 const resetTenant=()=>{setTenant(null);setBundle({clients:[],sites:[],projects:[],assets:[]});try{localStorage.removeItem('basmat.medical.knowledgeTenant')}catch{}}
 const loadWeb=async(url)=>{
  const name=query.trim();if(!name||busy)return
  setBusy(true);setError('');setOk('')
  try{
   const data=await medicalCompanySmartLookup(name,url,lang)
   if(data.candidates?.length){setWebCandidates(data.candidates);setOk(ar?'اختر الموقع الرسمي للشركة لاستيراد بياناته.':'Choose the official company website to import its data.');return}
   resetTenant();setForm(companyWebDraft(blank,data,name));setWebCandidates([])
   setOk(ar?'تم استيراد البيانات العامة من الموقع دون ذكاء اصطناعي. راجعها ثم احفظها في المكتبة.':'Public data imported without AI. Review it, then save to the library.')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const searchAndInsert=async()=>{
  const name=query.trim();if(!name||busy)return
  if(website.trim()){await loadWeb(website.trim());return}
  setBusy(true);setError('');setOk('');setWebCandidates([])
  try{
   const local=await medicalLibrarySearch(name);setResults(local)
   if(local.length){
    resetTenant()
    if(local.length===1){const r=local[0];setForm({...blank,...r,specialties:r.specialties||[],manufacturers:r.manufacturers||[],logo_source:r.logo_source||'library'});setOk(ar?'تم تحميل الشركة من المكتبة الطبية.':'Company loaded from the medical library.')}
    else{setForm(blank);setOk(ar?'توجد شركات متشابهة؛ اختر الشركة المطلوبة أدناه.':'Several companies match; choose the correct company below.')}
    return
   }
   const data=await medicalCompanySmartLookup(name,'',lang)
   setWebCandidates(data.candidates||[])
   setOk(ar?'اختر الموقع الرسمي للشركة لاستيراد بياناته دون ذكاء اصطناعي.':'Choose the official website to import company data without AI.')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const manual=()=>{const arName=/[\u0600-\u06ff]/.test(query);resetTenant();setForm({...blank,name_ar:arName?query.trim():'',name_en:arName?'':query.trim()});setError('');setOk(ar?'أكمل البيانات أدناه ثم احفظها في المكتبة.':'Complete the fields below, then save to the library.')}

 const save=async e=>{
  e.preventDefault()
  setBusy(true);setError('');setOk('')
  try{
   const id=await medicalLibrarySave(form)
   const rows=await medicalLibrarySearch(form.name_en||form.name_ar)
   setResults(rows)
   const row=rows.find(x=>x.id===id)||rows[0]
   if(row)setForm({...blank,...row,specialties:row.specialties||[],manufacturers:row.manufacturers||[]})
   setOk(ar?'تم الحفظ في المكتبة وظهر التحديث مباشرة':'Saved to Medical Library and refreshed immediately')
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const linkTenant=async()=>{
  setBusy(true);setError('');setOk('')
  try{
   let libraryId=form.id

   if(!libraryId){
    if(!(form.name_ar||form.name_en)){
     throw new Error(ar?'بيانات الشركة غير مكتملة':'Company data is incomplete')
    }

    libraryId=await medicalLibrarySave(form)

    const rows=await medicalLibrarySearch(form.name_en||form.name_ar)
    setResults(rows)

    const row=rows.find(x=>x.id===libraryId)||rows[0]
    if(row){
     setForm({
      ...blank,
      ...row,
      specialties:row.specialties||[],
      manufacturers:row.manufacturers||[]
     })
    }
   }

   const x=await createOrLinkMedicalTenant(libraryId)
   setTenant(x)
   try{ localStorage.setItem('basmat.medical.knowledgeTenant',JSON.stringify(x)) }catch{}
   setBundle(await medRelationshipBundle(x.organization_id))
   setOk(ar?'تم حفظ الشركة في المكتبة وإنشاء/ربط شركة الصيانة بنجاح':'Company saved to library and maintenance tenant linked successfully')
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 if(!isSuper)return <section className="facility-module"><div className="alert error">{ar?'Super Admin فقط':'Super Admin only'}</div></section>

 return <section className="facility-module">
  <div className="page-head">
   <div>
    <h1>{ar?'المكتبة الطبية الذكية وإدراج الشركات':'Medical Knowledge Library & Smart Onboarding'}</h1>
    <p className="muted">{ar?'ابحث في المكتبة أو استورد بيانات الشركة من موقعها الرسمي مجانًا، ثم راجعها واحفظها.':'Search the library or import public company data from its official website for free, then review and save.'}</p>
   </div>
  </div>

  {error&&<div className="alert error">{error}</div>}
  {ok&&<div className="alert success">{ok}</div>}

  <div className="facility-panel">
   <h2>{ar?'بحث واستيراد من الإنترنت':'Web search and import'}</h2>
   <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
    <label style={{flex:1}}>{ar?'اسم الشركة':'Company name'}
     <input value={query} disabled={busy} onChange={e=>{setQuery(e.target.value);setWebCandidates([])}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();searchAndInsert()}}}/>
    </label>
    <button type="button" className="btn primary" disabled={busy||!query.trim()} onClick={searchAndInsert}>{busy?(ar?'جارٍ البحث…':'Searching…'):(ar?'بحث واستيراد':'Search and import')}</button>
   </div>
   <div style={{marginTop:14}}><label>{ar?'رابط الموقع الرسمي — اختياري للبحث المباشر':'Official website — optional for direct import'}<input type="url" dir="ltr" value={website} disabled={busy} placeholder="https://company.com" onChange={e=>setWebsite(e.target.value)}/></label><p className="muted">{ar?'دون اشتراك ذكاء اصطناعي. الحقول غير المتاحة في الموقع تبقى فارغة لتكملها.':'No AI subscription. Fields not published on the website remain empty for you to complete.'}</p><div className="row-actions"><button type="button" className="btn secondary" disabled={busy} onClick={manual}>{ar?'إضافة يدويًا':'Add manually'}</button>{query.trim()&&<a className="btn secondary" href={'https://www.bing.com/search?q='+encodeURIComponent(query+' الموقع الرسمي official website')} target="_blank" rel="noopener noreferrer">{ar?'فتح بحث الإنترنت':'Open web search'}</a>}</div></div>
   {webCandidates.length>0&&<div style={{marginTop:14}}><h3>{ar?'اختر الموقع الرسمي الصحيح':'Choose the correct official website'}</h3>{webCandidates.map(c=><div className="row-actions" key={c.url} style={{marginBlock:8}}><span>{c.title} · {c.domain}</span><a href={c.url} target="_blank" rel="noopener noreferrer">{ar?'معاينة الموقع':'Preview website'}</a><button type="button" className="btn secondary" disabled={busy} onClick={()=>{setWebsite(c.url);loadWeb(c.url)}}>{ar?'استيراد من هذا الموقع':'Import from this website'}</button></div>)}</div>}
   {!!results.length&&<div style={{marginTop:12}}>
    {results.map(r=><button key={r.id} type="button" className="btn secondary" style={{marginInlineEnd:8,marginBottom:8}} onClick={()=>{resetTenant();setForm({...blank,...r,specialties:r.specialties||[],manufacturers:r.manufacturers||[]})}}>
     {r.name_ar||r.name_en}
    </button>)}
   </div>}
  </div>

  <form className="facility-panel" onSubmit={save}>
   <h2>{ar?'بيانات المكتبة':'Library Record'}</h2>{companySourceLinks(form.source_reference).length>0&&<p>{ar?'مصادر البيانات — راجعها قبل الحفظ: ':'Data sources — review before saving: '}{companySourceLinks(form.source_reference).map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{marginInlineEnd:12}}>{new URL(url).hostname}</a>)}</p>}

   {form.logo_url&&<div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
    <img src={form.logo_url} alt="" style={{width:84,height:84,objectFit:'contain',border:'1px solid #ddd',borderRadius:10,padding:6}}/>
    <div><strong>{form.name_ar||form.name_en}</strong><div className="muted">{ar?'مصدر الشعار: ':'Logo source: '}{form.logo_source||'—'}</div></div>
   </div>}

   <div className="form-grid">
    <label>{ar?'الاسم العربي':'Arabic name'}<input value={form.name_ar} onChange={e=>setForm(v=>({...v,name_ar:e.target.value}))}/></label>
    <label>{ar?'الاسم الإنجليزي':'English name'}<input value={form.name_en} onChange={e=>setForm(v=>({...v,name_en:e.target.value}))}/></label>
    <label>{ar?'الموقع الإلكتروني':'Website'}<input value={form.website} onChange={e=>setForm(v=>({...v,website:e.target.value}))}/></label>
    <label>{ar?'البريد':'Email'}<input value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></label>
    <label>{ar?'الهاتف':'Phone'}<input value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></label>
    <label>{ar?'المدينة':'City'}<input value={form.city} onChange={e=>setForm(v=>({...v,city:e.target.value}))}/></label>
    <label>{ar?'السجل التجاري':'Registration'}<input value={form.registration_no} onChange={e=>setForm(v=>({...v,registration_no:e.target.value}))}/></label>
    <label>{ar?'الرقم الضريبي':'VAT'}<input value={form.vat_no} onChange={e=>setForm(v=>({...v,vat_no:e.target.value}))}/></label>
    <label className="span-2">{ar?'العنوان':'Address'}<input value={form.address} onChange={e=>setForm(v=>({...v,address:e.target.value}))}/></label>
    <label className="span-2">{ar?'الشعار - رابط مباشر أو اترك الموجود':'Logo URL / keep existing'}<input value={form.logo_url} onChange={e=>setForm(v=>({...v,logo_url:e.target.value,logo_source:'manual_url'}))}/></label>
    <label className="span-2">{ar?'التخصصات - مفصولة بفاصلة':'Specialties - comma separated'}<input value={(form.specialties||[]).join(', ')} onChange={e=>setForm(v=>({...v,specialties:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)}))}/></label>
    <label className="span-2">{ar?'الشركات المصنعة المرتبطة - مفصولة بفاصلة':'Manufacturers - comma separated'}<input value={(form.manufacturers||[]).join(', ')} onChange={e=>setForm(v=>({...v,manufacturers:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)}))}/></label>
    <label className="span-2">{ar?'ملاحظات المكتبة':'Library notes'}<textarea rows="3" value={form.notes||''} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></label>
   </div>
   <div className="form-actions">
    <button className="btn primary" disabled={busy}>{ar?'اعتماد وحفظ في المكتبة':'Approve & Save to Library'}</button>
   </div>
  </form>

  <div className="facility-panel">
   <h2>{ar?'إنشاء / ربط شركة الصيانة':'Create / Link Maintenance Company'}</h2>
   <button className="btn primary" disabled={busy||!(form.name_ar||form.name_en)} onClick={linkTenant}>{ar?'إنشاء أو ربط الشركة':'Create or Link Company'}</button>
   {tenant&&<div style={{marginTop:14}}>
    <strong>{tenant.name_ar||tenant.name_en}</strong>
    <div className="muted">{tenant.organization_id}</div>
   </div>}
  </div>

  {tenant&&<>
   <MedicalCompanyRelationships tenant={tenant} onChanged={async()=>setBundle(await medRelationshipBundle(tenant.organization_id))}/>
   <div className="facility-panel">
    <h2>{ar?'العلاقات الطبية الحالية':'Current Medical Relationships'}</h2>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:12}}>
     <div className="kpi-card"><b>{ar?'الملاك':'Owners'}</b><strong>{bundle.clients?.length||0}</strong></div>
     <div className="kpi-card"><b>{ar?'المشاريع':'Projects'}</b><strong>{bundle.projects?.length||0}</strong></div>
     <div className="kpi-card"><b>{ar?'المواقع':'Sites'}</b><strong>{bundle.sites?.length||0}</strong></div>
     <div className="kpi-card"><b>{ar?'الأجهزة':'Assets'}</b><strong>{bundle.assets?.length||0}</strong></div>
    </div>
   </div>
  </>}
 </section>
}

