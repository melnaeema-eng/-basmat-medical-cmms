import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMasterAssetLibrary} from '../lib/masterAssetLibrary'

const emptyForm={
 id:'',code:'',name_ar:'',name_en:'',company_type:'medical_maintenance',
 specialties:'',manufacturer_ids:[],asset_type_ids:[],regions:'',
 license_reference:'',accreditation:'',sla_hours:'',emergency_support:false,
 contact_name:'',phone:'',email:'',website:'',notes:''
}

export default function MedicalServiceCompaniesLibrary(){
 const {lang}=useLanguage()
 const {access,can}=useAuth()
 const ar=lang==='ar'
 const [companies,setCompanies]=useState([])
 const [master,setMaster]=useState({types:[],manufacturers:[]})
 const [orgs,setOrgs]=useState([]),[sites,setSites]=useState([]),[projects,setProjects]=useState([])
 const [q,setQ]=useState(''),[selected,setSelected]=useState(null)
 const [form,setForm]=useState(emptyForm),[adminOpen,setAdminOpen]=useState(false)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [link,setLink]=useState({organization_id:'',project_id:'',site_id:'',manufacturer_id:'',asset_type_id:'',contract_reference:'',notes:''})

 const load=async()=>{
  setError('')
  try{
   const [c,o,s,m]=await Promise.all([
    supabase.from('bf_med_service_companies').select('*').order('name_ar'),
    supabase.from('bf_organizations').select('id,name,code,status').eq('status','active').order('name'),
    supabase.from('bf_sites').select('id,organization_id,client_id,name,status').eq('status','active').order('name'),
    loadMasterAssetLibrary()
   ])
   if(c.error)throw c.error;if(o.error)throw o.error;if(s.error)throw s.error
   setCompanies(c.data||[]);setOrgs(o.data||[]);setSites(s.data||[])
   setMaster(m||{types:[],manufacturers:[]})
   const batches=await Promise.all((o.data||[]).map(async org=>{
    const {data,error}=await supabase.rpc('bf35_structure',{p_org:org.id})
    if(error)return[]
    return (data?.projects||[]).map(p=>({...p,organization_id:p.organization_id||org.id}))
   }))
   setProjects(batches.flat())
  }catch(e){setError(e.message)}
 }

 useEffect(()=>{load()},[])

 const rows=useMemo(()=>{
  const needle=q.trim().toLowerCase()
  return companies.filter(x=>{
   if(!needle)return true
   return [
    x.code,x.name_ar,x.name_en,x.company_type,x.license_reference,x.accreditation,
    ...(x.specialties||[]),...(x.regions||[])
   ].filter(Boolean).join(' ').toLowerCase().includes(needle)
  })
 },[companies,q])

 const manufacturerName=id=>{
  const x=(master.manufacturers||[]).find(v=>String(v.id)===String(id))
  return x?.short_name||x?.name||id
 }
 const assetName=id=>{
  const x=(master.types||[]).find(v=>String(v.id)===String(id))
  return ar?(x?.name_ar||x?.name_en||id):(x?.name_en||x?.name_ar||id)
 }
 const display=x=>ar?(x.name_ar||x.name_en||x.code):(x.name_en||x.name_ar||x.code)

 const choose=x=>{
  setSelected(x);setError('');setSuccess('')
  setLink({organization_id:'',project_id:'',site_id:'',manufacturer_id:'',asset_type_id:'',contract_reference:'',notes:''})
 }

 const edit=x=>{
  setForm({
   ...emptyForm,...x,
   specialties:(x.specialties||[]).join(', '),
   regions:(x.regions||[]).join(', '),
   manufacturer_ids:x.manufacturer_ids||[],
   asset_type_ids:x.asset_type_ids||[],
   sla_hours:x.sla_hours??''
  })
  setAdminOpen(true)
  window.setTimeout(()=>document.getElementById('medical-company-admin')?.scrollIntoView({behavior:'smooth'}),50)
 }

 const save=async()=>{
  try{
   setBusy(true);setError('');setSuccess('')
   const payload={
    ...form,
    specialties:form.specialties.split(',').map(x=>x.trim()).filter(Boolean),
    regions:form.regions.split(',').map(x=>x.trim()).filter(Boolean),
    sla_hours:form.sla_hours===''?null:Number(form.sla_hours)
   }
   const {error}=await supabase.rpc('bf_med_company_upsert',{p_id:form.id||null,p_payload:payload})
   if(error)throw error
   setSuccess(ar?'تم حفظ شركة الصيانة الطبية.':'Medical maintenance company saved.')
   setForm(emptyForm);await load()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const archive=async(x,active)=>{
  try{
   setBusy(true);setError('');setSuccess('')
   const {error}=await supabase.rpc('bf_med_company_set_active',{p_id:x.id,p_active:active})
   if(error)throw error
   setSuccess(ar?(active?'تمت إعادة التفعيل.':'تمت الأرشفة.'):(active?'Reactivated.':'Archived.'))
   await load()
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const linkCompany=async()=>{
  if(!selected||!link.organization_id||!link.project_id){
   setError(ar?'اختر المنظمة والمشروع أولاً.':'Select organization and project first.');return
  }
  try{
   setBusy(true);setError('');setSuccess('')
   const {error}=await supabase.rpc('bf_med_link_company',{
    p_org:link.organization_id,p_project:link.project_id,p_site:link.site_id||null,
    p_company:selected.id,p_manufacturer:link.manufacturer_id||null,p_asset_type:link.asset_type_id||null,
    p_contract_reference:link.contract_reference||null,p_notes:link.notes||null
   })
   if(error)throw error
   setSuccess(ar?'تم ربط شركة الصيانة الطبية بالمشروع.':'Medical maintenance company linked to the project.')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 const availableProjects=projects.filter(x=>!link.organization_id||x.organization_id===link.organization_id)
 const availableSites=sites.filter(x=>!link.organization_id||x.organization_id===link.organization_id)

 return <section className="facility-module">
  <div className="page-head">
   <div>
    <h1>{ar?'دليل شركات صيانة الأجهزة الطبية':'Medical Maintenance Companies Library'}</h1>
    <p>{ar?'دليل مستقل لشركات صيانة الأجهزة الطبية وربطها بالمشاريع والمواقع والشركات المصنعة وفئات الأجهزة.':'Independent medical equipment maintenance provider library linked to projects, sites, manufacturers and equipment categories.'}</p>
   </div>
   {access?.super_admin&&<button className="btn primary" onClick={()=>{setAdminOpen(v=>!v);setForm(emptyForm)}}>{ar?'+ إضافة / إدارة شركة':'+ Add / Manage Company'}</button>}
  </div>

  {error&&<div className="alert error">{error}</div>}
  {success&&<div className="alert success">{success}</div>}

  <div className="facility-panel">
   <input value={q} onChange={e=>setQ(e.target.value)}
    placeholder={ar?'بحث بالاسم أو التخصص أو المنطقة أو الاعتماد...':'Search name, specialty, region or accreditation...'}/>
  </div>

  {adminOpen&&access?.super_admin&&<div id="medical-company-admin" className="facility-panel">
   <h2>{form.id?(ar?'تعديل شركة':'Edit company'):(ar?'إضافة شركة صيانة طبية':'Add medical maintenance company')}</h2>
   <div className="form-grid">
    <label>Code<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></label>
    <label>{ar?'الاسم بالعربية':'Arabic name'}<input value={form.name_ar} onChange={e=>setForm({...form,name_ar:e.target.value})}/></label>
    <label>{ar?'الاسم بالإنجليزية':'English name'}<input value={form.name_en||''} onChange={e=>setForm({...form,name_en:e.target.value})}/></label>
    <label>{ar?'التخصصات — مفصولة بفاصلة':'Specialties — comma separated'}<input value={form.specialties} onChange={e=>setForm({...form,specialties:e.target.value})} placeholder="Imaging, Lab, ICU, OR, CSSD"/></label>
    <label>{ar?'المناطق — مفصولة بفاصلة':'Regions — comma separated'}<input value={form.regions} onChange={e=>setForm({...form,regions:e.target.value})}/></label>
    <label>{ar?'الترخيص / المرجع':'License reference'}<input value={form.license_reference||''} onChange={e=>setForm({...form,license_reference:e.target.value})}/></label>
    <label>{ar?'الاعتماد':'Accreditation'}<input value={form.accreditation||''} onChange={e=>setForm({...form,accreditation:e.target.value})}/></label>
    <label>SLA Hours<input type="number" min="0" value={form.sla_hours} onChange={e=>setForm({...form,sla_hours:e.target.value})}/></label>
    <label>{ar?'اسم مسؤول التواصل':'Contact name'}<input value={form.contact_name||''} onChange={e=>setForm({...form,contact_name:e.target.value})}/></label>
    <label>{ar?'الهاتف':'Phone'}<input value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
    <label>Email<input type="email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label>Website<input value={form.website||''} onChange={e=>setForm({...form,website:e.target.value})}/></label>
    <label>{ar?'الشركات المصنعة المخدومة':'Supported manufacturers'}
     <select multiple value={form.manufacturer_ids} onChange={e=>setForm({...form,manufacturer_ids:[...e.target.selectedOptions].map(o=>o.value)})} style={{minHeight:120}}>
      {(master.manufacturers||[]).filter(x=>x.status!=='archived').map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
     </select>
    </label>
    <label>{ar?'فئات الأجهزة المخدومة':'Supported equipment categories'}
     <select multiple value={form.asset_type_ids} onChange={e=>setForm({...form,asset_type_ids:[...e.target.selectedOptions].map(o=>o.value)})} style={{minHeight:120}}>
      {(master.types||[]).filter(x=>x.status!=='archived').map(x=><option key={x.id} value={x.id}>{ar?(x.name_ar||x.name_en):(x.name_en||x.name_ar)}</option>)}
     </select>
    </label>
    <label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!form.emergency_support} onChange={e=>setForm({...form,emergency_support:e.target.checked})}/>{ar?'دعم طوارئ':'Emergency support'}</label>
    <label style={{gridColumn:'1/-1'}}>{ar?'ملاحظات':'Notes'}<textarea value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   </div>
   <div className="row-actions">
    <button className="btn primary" disabled={busy} onClick={save}>{ar?'حفظ':'Save'}</button>
    <button className="btn" onClick={()=>setForm(emptyForm)}>{ar?'جديد':'New'}</button>
   </div>
  </div>}

  <div className="security-check-list">
   {rows.map(x=><article key={x.id} className="security-check-card" onClick={()=>choose(x)} style={{cursor:'pointer'}}>
    <div style={{width:'100%'}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}>
      <div><strong>{display(x)}</strong><p>{x.code}{x.company_type?` · ${x.company_type}`:''}</p></div>
      <span>{x.status}</span>
     </div>
     {!!x.specialties?.length&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{x.specialties.map(v=><span key={v} className="badge">{v}</span>)}</div>}
     <div className="row-actions" style={{marginTop:8}}>
      <button className="btn secondary" onClick={e=>{e.stopPropagation();choose(x)}}>{ar?'التفاصيل / الربط':'Details / Link'}</button>
      {access?.super_admin&&<button className="btn" onClick={e=>{e.stopPropagation();edit(x)}}>{ar?'تعديل':'Edit'}</button>}
      {access?.super_admin&&<button className="btn" onClick={e=>{e.stopPropagation();archive(x,x.status!=='active')}}>{x.status==='active'?(ar?'أرشفة':'Archive'):(ar?'تفعيل':'Activate')}</button>}
     </div>
    </div>
   </article>)}
   {!rows.length&&<div className="facility-panel">{ar?'لا توجد شركات مطابقة. أضف شركة من إدارة المكتبة.':'No matching companies. Add a company from library management.'}</div>}
  </div>

  {selected&&<div className="facility-panel" style={{marginTop:16}}>
   <h2>{display(selected)}</h2>
   <p>{selected.notes||''}</p>
   <div className="form-grid">
    <div><strong>{ar?'التخصصات':'Specialties'}</strong><p>{(selected.specialties||[]).join(' · ')||'—'}</p></div>
    <div><strong>{ar?'المناطق':'Regions'}</strong><p>{(selected.regions||[]).join(' · ')||'—'}</p></div>
    <div><strong>{ar?'الشركات المصنعة':'Manufacturers'}</strong><p>{(selected.manufacturer_ids||[]).map(manufacturerName).join(' · ')||'—'}</p></div>
    <div><strong>{ar?'فئات الأجهزة':'Equipment categories'}</strong><p>{(selected.asset_type_ids||[]).map(assetName).join(' · ')||'—'}</p></div>
    <div><strong>SLA</strong><p>{selected.sla_hours?`${selected.sla_hours} h`:'—'}</p></div>
    <div><strong>{ar?'الطوارئ':'Emergency'}</strong><p>{selected.emergency_support?(ar?'متاح':'Available'):'—'}</p></div>
   </div>
   {selected.website&&<p><a href={selected.website} target="_blank" rel="noreferrer">{ar?'الموقع الإلكتروني':'Website'}</a></p>}

   <h3>{ar?'ربط بالشغيل / المشروع':'Operational project link'}</h3>
   <div className="form-grid">
    <label>{ar?'المنظمة':'Organization'}<select value={link.organization_id} onChange={e=>setLink({...link,organization_id:e.target.value,project_id:'',site_id:''})}><option value="">—</option>{orgs.map(x=><option key={x.id} value={x.id}>{x.name||x.code}</option>)}</select></label>
    <label>{ar?'المشروع':'Project'}<select value={link.project_id} onChange={e=>setLink({...link,project_id:e.target.value})}><option value="">—</option>{availableProjects.map(x=><option key={x.id} value={x.id}>{x.project_code?`${x.project_code} — `:''}{x.name}</option>)}</select></label>
    <label>{ar?'الموقع':'Site'}<select value={link.site_id} onChange={e=>setLink({...link,site_id:e.target.value})}><option value="">—</option>{availableSites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label>{ar?'الشركة المصنعة':'Manufacturer'}<select value={link.manufacturer_id} onChange={e=>setLink({...link,manufacturer_id:e.target.value})}><option value="">—</option>{(master.manufacturers||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label>{ar?'فئة الجهاز':'Equipment category'}<select value={link.asset_type_id} onChange={e=>setLink({...link,asset_type_id:e.target.value})}><option value="">—</option>{(master.types||[]).map(x=><option key={x.id} value={x.id}>{ar?(x.name_ar||x.name_en):(x.name_en||x.name_ar)}</option>)}</select></label>
    <label>{ar?'مرجع العقد':'Contract reference'}<input value={link.contract_reference} onChange={e=>setLink({...link,contract_reference:e.target.value})}/></label>
    <label style={{gridColumn:'1/-1'}}>{ar?'ملاحظات الربط':'Link notes'}<textarea value={link.notes} onChange={e=>setLink({...link,notes:e.target.value})}/></label>
   </div>
   <button className="btn primary" disabled={busy||!(access?.super_admin||can('supplier-performance.manage',link.organization_id||null)||can('contracts.manage',link.organization_id||null))} onClick={linkCompany}>
    {ar?'ربط الشركة بالمشروع':'Link company to project'}
   </button>
  </div>}
 </section>
}
