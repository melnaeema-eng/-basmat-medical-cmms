import {useEffect,useState} from 'react'
import {Link,useNavigate,useOutletContext,useSearchParams} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {supabase} from '../lib/supabaseClient'
import {ownerLogoSource,readOwnerLogo} from '../lib/ownerLogo'
import UsersRoles from './UsersRoles'

const blank={name_ar:'',name_en:'',registration_no:'',vat_no:'',email:'',phone:'',city:'',address:'',logo_url:'',company_admin_users:true}
const serviceCompanies=new Set(['maintenance_contractor','service_provider','subcontractor'])

export default function MaintenanceCompanies({libraryPath='/medical-knowledge-library'}){
 const {lang}=useLanguage(),L=(ar,en)=>lang==='ar'?ar:en
 const navigate=useNavigate(),{companyId:workspaceId}=useOutletContext()
 const [params,setParams]=useSearchParams()
 const [rows,setRows]=useState([]),[query,setQuery]=useState(''),[archived,setArchived]=useState(false)
 const [form,setForm]=useState(null),[busy,setBusy]=useState(false),[readingLogo,setReadingLogo]=useState(false)
 const [error,setError]=useState(''),[success,setSuccess]=useState('')
 const name=row=>L(row.name_ar||row.name||row.name_en,row.name_en||row.name||row.name_ar)||row.code
 const companies=rows.filter(row=>!row.organization_type||serviceCompanies.has(row.organization_type))
 const managingId=params.get('users')
 const company=managingId&&companies.find(row=>row.id===(managingId==='current'?workspaceId:managingId))
 const logo=ownerLogoSource(form?.logo_url)
 const set=(field,value)=>setForm(current=>({...current,[field]:value}))
 const changed=()=>window.dispatchEvent(new Event('basmat-organizations-changed'))

 async function load(){
  setBusy(true);setError('')
  try{
   const {data,error}=await supabase.rpc('bf_fac_company_workspace_directory')
   if(error)throw error
   setRows(data||[])
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])
 const visible=companies.filter(row=>archived?row.status==='archived':row.status!=='archived')
  .filter(row=>[row.name,row.name_ar,row.name_en,row.code].join(' ').toLowerCase().includes(query.trim().toLowerCase()))

 function openWorkspace(row){
  localStorage.setItem('basmat.active.organization',row.id)
  window.dispatchEvent(new CustomEvent('basmat-organization-changed',{detail:{organization_id:row.id}}))
  navigate('/')
 }
 function edit(row){
  setError('');setSuccess('');setForm({...blank,...row,name_ar:row.name_ar||(!row.name_en?row.name:''),logo_url:row.logo_url||''})
  window.scrollTo({top:0,behavior:'smooth'})
 }
 async function uploadLogo(file){
  if(!file)return
  setReadingLogo(true);setError('')
  try{set('logo_url',await readOwnerLogo(file))}catch(e){setError(e.message)}finally{setReadingLogo(false)}
 }
 async function save(e){
  e.preventDefault();if(busy||readingLogo)return
  setBusy(true);setError('');setSuccess('')
  try{
   if(form.logo_url?.trim()&&!logo)throw Error(L('أدخل رابط HTTPS صالحًا أو ارفع صورة الشعار.','Enter a valid HTTPS URL or upload a logo image.'))
   const {error}=await supabase.rpc('bf_med_save_company_workspace',{p_org:form.id||null,
    p_identity:Object.fromEntries(Object.keys(blank).map(key=>[key,key==='logo_url'?logo:form[key]]))})
   if(error)throw error
   setForm(null);changed();await load()
   setSuccess(L('تم حفظ بيانات الشركة.','Company details saved.'))
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function archive(row){
  const restore=row.status==='archived'
  if(!window.confirm(restore?L('إعادة تفعيل الشركة؟','Reactivate this company?'):L('أرشفة الشركة مع الاحتفاظ بسجلاتها؟','Archive this company and retain its records?')))return
  setBusy(true);setError('');setSuccess('')
  try{
   const {error}=await supabase.rpc('bf_med_set_company_workspace_status',{p_org:row.id,p_status:restore?'active':'archived'})
   if(error)throw error
   changed();await load()
   setSuccess(restore?L('تمت استعادة الشركة.','Company restored.'):L('تمت أرشفة الشركة.','Company archived.'))
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{L('مساحات الشركات','Company workspaces')}</h1></div>
   <div className="row-actions">
    {company?<button className="btn secondary" onClick={()=>setParams({})}>{L('العودة إلى الشركات','Back to companies')}</button>:<>
     <button className="btn primary" disabled={busy} onClick={()=>setForm({...blank})}>{L('+ شركة جديدة','+ New company')}</button>
     <Link className="btn secondary" to={libraryPath}>{L('إنشاء من المكتبة','Create from library')}</Link>
     <button className="btn secondary" disabled={busy} onClick={load}>{L('تحديث','Refresh')}</button>
    </>}
   </div>
  </div>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {success&&<div className="alert success" role="status">{success}</div>}
  {company?<UsersRoles key={company.id} organization={company}/>:<>
   {form&&<form className="facility-panel" onSubmit={save}>
    <h2>{form.id?L('تعديل بيانات الشركة','Edit company details'):L('إضافة شركة','Add company')}</h2>
    <div className="form-grid">
     {[
      ['name_ar',L('الاسم بالعربية','Arabic name')],['name_en',L('الاسم بالإنجليزية','English name')],
      ['registration_no',L('السجل التجاري','Registration number')],['vat_no',L('الرقم الضريبي','VAT number')],
      ['email',L('البريد الإلكتروني','Email'),'email'],['phone',L('الهاتف','Phone'),'tel'],
      ['city',L('المدينة','City')],['address',L('العنوان','Address')]
     ].map(([key,label,type])=><label key={key}>{label}<input type={type||'text'} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
     <label>{L('رفع شعار الشركة','Upload company logo')}<input disabled={busy||readingLogo} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadLogo(e.target.files?.[0])}/></label>
     <label>{L('أو رابط شعار الشركة','Or company logo URL')}<input type="text" inputMode="url" placeholder="https://…" value={form.logo_url?.startsWith('data:')?'':form.logo_url||''} onChange={e=>set('logo_url',e.target.value)}/></label>
     {logo&&<div className="span-2 row-actions"><img src={logo} alt={L('شعار الشركة','Company logo')} style={{width:84,height:64,objectFit:'contain'}}/><button type="button" className="btn secondary" onClick={()=>set('logo_url','')}>{L('إزالة الشعار','Remove logo')}</button></div>}
     <label className="span-2"><input type="checkbox" checked={form.company_admin_users===true} onChange={e=>set('company_admin_users',e.target.checked)}/> {L('السماح لأدمن الشركة بإدارة مستخدميها','Allow company administrators to manage their users')}</label>
    </div>
    <div className="form-actions">
     <button className="btn primary" disabled={busy||readingLogo||!(form.name_ar?.trim()||form.name_en?.trim())}>{L('حفظ الشركة','Save company')}</button>
     <button type="button" className="btn secondary" disabled={busy||readingLogo} onClick={()=>setForm(null)}>{L('إلغاء','Cancel')}</button>
    </div>
   </form>}
   <div className="facility-panel row-actions">
    <label>{L('بحث بالاسم أو الكود','Search by name or code')}<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <button className={'btn '+(!archived?'primary':'secondary')} onClick={()=>setArchived(false)}>{L('الشركات الحالية','Current companies')}</button>
    <button className={'btn '+(archived?'primary':'secondary')} onClick={()=>setArchived(true)}>{L('المؤرشفة','Archived')}</button>
   </div>
   {busy&&<p role="status">{L('جارٍ التحميل…','Loading…')}</p>}
   {!busy&&!visible.length&&<div className="facility-panel">{L('لا توجد شركات مطابقة.','No matching companies.')}</div>}
   {visible.map(row=><article className="facility-panel" key={row.id}><div className="page-head">
    <div><h2>{name(row)}</h2><p className="muted">{[row.code,row.city,row.address].filter(Boolean).join(' · ')}</p></div>
    <div className="row-actions">
     {row.status==='active'&&<>
      <button className="btn primary" disabled={busy} onClick={()=>openWorkspace(row)}>{row.id===workspaceId?L('فتح المساحة الحالية','Open current workspace'):L('التبديل إلى هذه الشركة','Switch to this company')}</button>
      <button className="btn secondary" disabled={busy} onClick={()=>{setForm(null);setParams({users:row.id})}}>{L('المستخدمون والصلاحيات','Users & access')}</button>
     </>}
     <button className="btn secondary" disabled={busy} onClick={()=>edit(row)}>{L('تعديل البيانات والشعار','Edit details and logo')}</button>
     <button className="btn secondary" disabled={busy} onClick={()=>archive(row)}>{row.status==='archived'?L('استعادة','Restore'):L('أرشفة','Archive')}</button>
    </div>
   </div></article>)}
  </>}
 </section>
}
