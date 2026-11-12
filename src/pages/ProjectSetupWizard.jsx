import {partyRoleError} from '../lib/partyRoleErrors'
import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'
import {useAuth} from '../context/AuthContext'
import {createSetupProject} from '../lib/projectSetupV1'
import {setupErrorMessage,setupNextStep,setupProjectScope} from '../lib/projectSetupStatus'
import './ProjectSetupWizard.css'

const emptyCounts={sites:0,assets:null,team:null,ppm:null}
const live=x=>!['archived','inactive','cancelled','closed'].includes(x.status)
export default function ProjectSetupWizard(){
 const {lang}=useLanguage(),ar=lang==='ar'
 const {access,can}=useAuth(),navigate=useNavigate(),request=useRef(0)
 const [activeOrg,setActiveOrg]=useState(()=>localStorage.getItem('basmat.active.organization')||'')
 const org=access?.super_admin?activeOrg:(access?.home_organization?.organization_id||access?.home_organization?.id||'')
 const [projects,setProjects]=useState([]),[projectId,setProjectId]=useState(''),[owners,setOwners]=useState([])
 const [company,setCompany]=useState(null),[counts,setCounts]=useState(emptyCounts),[stage,setStage]=useState(0)
 const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[warning,setWarning]=useState('')
 const [creating,setCreating]=useState(false),[form,setForm]=useState({name:'',client_id:'',contract_id:''})
 const [contracts,setContracts]=useState([])
 const name=row=>(ar?row?.name_ar:row?.name_en)||row?.name||row?.project_name||row?.project_code||row?.code||'—'
 const selected=projects.find(p=>p.id===projectId)
 const next=setupNextStep({project:selected,...counts})
 const canCreate=!!org&&(can('projects.manage',org)||can('enterprise-structure.manage',org))
 const readCount=async(table,select,filter)=>{
  const {count,error}=await filter(supabase.from(table).select(select,{count:'exact',head:true}))
  if(error)throw error
  return count??0
 }
 const reload=async(preferred)=>{
  const ticket=++request.current
  setError('');setWarning('');setCounts(emptyCounts);setBusy(true)
  if(!org){setProjects([]);setProjectId('');setCompany(null);setBusy(false);return}
  try{
   const result=await Promise.allSettled([
    supabase.rpc('bf35_structure',{p_org:org}),
    supabase.from('bf_clients').select('id,name,code').eq('organization_id',org).neq('status','archived').order('name'),
    supabase.from('bf_organizations').select('id,name,name_ar,name_en').eq('id',org).maybeSingle(),
    supabase.from('bf_contracts').select('id,client_id,contract_number,status').eq('organization_id',org).neq('status','archived')
   ])
   if(ticket!==request.current)return
   const unwrap=(i)=>{const r=result[i];if(r.status==='rejected')throw r.reason;if(r.value.error)throw r.value.error;return r.value.data}
   const structure=unwrap(0)||{}
   const available=(structure.projects||[]).filter(live)
   setProjects(available)
   try{setOwners(unwrap(1)||[])}catch{setOwners([])}
   try{setCompany(unwrap(2))}catch{setCompany(null)}
   try{setContracts(unwrap(3)||[])}catch{setContracts([])}
   const chosen=available.find(p=>p.id===preferred)?.id||available.find(p=>p.id===sessionStorage.getItem('basmat.setup.project.'+org))?.id||available[0]?.id||''
   setProjectId(chosen)
   if(!chosen){setStage(0);return}
   sessionStorage.setItem('basmat.setup.project.'+org,chosen)
   const scope=setupProjectScope(structure,chosen)
   const metrics=scope.siteIds.length?await Promise.allSettled([
    readCount('bf_assets','id',q=>q.eq('organization_id',org).in('site_id',scope.siteIds).neq('status','archived')),
    readCount('bf_ppm_plans','id,bf_assets!inner(site_id)',q=>q.eq('organization_id',org).eq('status','active').in('bf_assets.site_id',scope.siteIds))
   ]):[{status:'fulfilled',value:0},{status:'fulfilled',value:0}]
   if(ticket!==request.current)return
   const current={sites:scope.siteIds.length,team:scope.members.length,assets:metrics[0].status==='fulfilled'?metrics[0].value:null,ppm:metrics[1].status==='fulfilled'?metrics[1].value:null}
   setCounts(current);setStage(setupNextStep({project:scope.project,...current})??2)
   if(metrics.some(m=>m.status==='rejected'))setWarning(ar?'تعذر التحقق من بعض البيانات؛ لم تُحتسب كبيانات ناقصة.':'Some checks are unavailable; they have not been counted as missing.')
  }catch(e){if(ticket===request.current){setProjects([]);setProjectId('');setError(partyRoleError(e,lang,setupErrorMessage(e,lang)))}}
  finally{if(ticket===request.current)setBusy(false)}
 }
 useEffect(()=>{
  const changed=e=>setActiveOrg(e.detail?.organization_id||'')
  window.addEventListener('basmat-organization-changed',changed)
  return()=>window.removeEventListener('basmat-organization-changed',changed)
 },[])
 useEffect(()=>{setProjects([]);setProjectId('');setOwners([]);setContracts([]);setCreating(false);setForm({name:'',client_id:'',contract_id:''});reload();return()=>{request.current++}},[org])
 const open=path=>{
  sessionStorage.setItem('bafm-project-setup-return','/project-setup')
  sessionStorage.setItem('bafm-project-setup-step',String(stage+1))
  navigate(path+'?setup=1&project='+encodeURIComponent(projectId))
 }
 const create=async e=>{
  e.preventDefault();if(!org||!form.name.trim()||!form.client_id)return
  setSaving(true);setError('')
  try{const id=await createSetupProject({...form,name:form.name.trim(),organization_id:org});setCreating(false);await reload(id)}
  catch(e){setError(partyRoleError(e,lang,setupErrorMessage(e,lang)))}finally{setSaving(false)}
 }
 const labels=ar?['المشروع والجهات','المواقع والأجهزة','فريق التشغيل والوقائية']:['Project and parties','Sites and devices','Team and preventive maintenance']
 const hints=ar?['حدد المالك والمشروع','أين الأجهزة وما هي؟','من ينفذ؟ وما جدول الصيانة؟']:['Identify the owner and project','Where are the devices?','Who maintains them, and when?']
 const metric=value=>value===null?(ar?'لم يتم التحقق':'Not verified'):value
 const task=(title,value,help,path,button,enabled=true)=><div className="setup-task"><div><h3>{title}<span className={'setup-badge '+(value>0?'done':'')}>{value>0?(ar?'موجود':'Available'):metric(value)===0?(ar?'مطلوب':'Needed'):metric(value)}</span></h3><p>{help}</p></div><button className="btn" disabled={!enabled||busy} onClick={()=>open(path)}>{button}</button></div>
 return <section className="facility-module setup-simple" dir={ar?'rtl':'ltr'}>
  <header className="setup-heading"><div><span className="setup-eyebrow">{ar?'إعداد المشروع':'Project setup'}</span><h1>{ar?'جهّز مشروعك بخطوات بسيطة':'Set up your project, one step at a time'}</h1><p>{ar?'اختر المشروع، ثم أكمل المطلوب أدناه.':'Select a project, then complete the next task below.'}</p></div><button className="btn" disabled={busy||saving||!org} onClick={()=>reload(projectId)}>{busy?(ar?'جارٍ التحقق…':'Checking…'):(ar?'تحديث':'Refresh')}</button></header>
  {!org?<div className="setup-empty"><h2>{ar?'اختر شركة الصيانة أولاً':'Select a maintenance company first'}</h2><p>{ar?'استخدم اختيار الشركة أعلى النظام لعرض مشاريعها.':'Use the company selector in the top bar to see its projects.'}</p></div>:<>
   <div className="setup-context"><div><span>{ar?'شركة الصيانة':'Maintenance company'}</span><strong>{name(company||access?.organizations?.find(o=>(o.organization_id||o.id)===org))}</strong></div><label><span>{ar?'المشروع':'Project'}</span><select value={projectId} disabled={busy||saving||!projects.length} onChange={e=>{setCreating(false);reload(e.target.value)}}><option value="">{ar?'اختر مشروعاً':'Select a project'}</option>{projects.map(p=><option key={p.id} value={p.id}>{name(p)}</option>)}</select></label>{canCreate&&<button className="btn" disabled={busy||saving} onClick={()=>{setCreating(true);setStage(0)}}>{ar?'+ مشروع جديد':'+ New project'}</button>}</div>
   {error&&<div className="alert error" role="alert"><strong>{ar?'تعذر تحميل الإعداد':'Setup could not be loaded'}</strong><p>{error}</p><button className="btn" disabled={busy} onClick={()=>reload(projectId)}>{ar?'إعادة المحاولة':'Retry'}</button></div>}
   {warning&&<div className="setup-warning" role="status">{warning}</div>}
   {!error&&<div className="setup-layout" aria-busy={busy}>
    <nav className="setup-stages" aria-label={ar?'مراحل الإعداد':'Setup stages'}>{labels.map((label,i)=><button key={label} className={stage===i?'active':''} aria-current={stage===i?'step':undefined} onClick={()=>{setStage(i);setCreating(false)}}><span className="setup-stage-number">{i+1}</span><span><strong>{label}</strong><small>{hints[i]}</small></span></button>)}</nav>
    <main className="setup-content"><div className="setup-section-heading"><span>{ar?'الخطوة':'Step'} {stage+1} / 3</span><h2>{labels[stage]}</h2></div>
     {busy?<div className="setup-empty" role="status">{ar?'جارٍ تحميل بيانات المشروع…':'Loading project data…'}</div>:stage===0?<>
      {creating||!selected?<div><p>{ar?'اختر مشروعاً موجوداً من الأعلى، أو أنشئ مشروعاً جديداً.':'Choose an existing project above, or create a new one.'}</p>{canCreate&&<form onSubmit={create} className="setup-form"><label>{ar?'اسم المشروع':'Project name'}<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>{ar?'الجهة المالكة':'Owner'}<select required value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value,contract_id:''})}><option value="">{ar?'اختر المالك':'Select owner'}</option>{owners.map(o=><option key={o.id} value={o.id}>{name(o)}</option>)}</select></label>{!owners.length&&<p>{ar?'لا توجد جهة مالكة متاحة لهذه الشركة. أضفها من إدارة الجهات ثم حدّث الصفحة.':'No owner is available for this company. Add one in organization management, then refresh.'}</p>}<details><summary>{ar?'ربط عقد — اختياري':'Link a contract — optional'}</summary><select aria-label={ar?'العقد':'Contract'} value={form.contract_id} onChange={e=>setForm({...form,contract_id:e.target.value})}><option value="">{ar?'لاحقاً':'Later'}</option>{contracts.filter(c=>c.client_id===form.client_id).map(c=><option key={c.id} value={c.id}>{c.contract_number}</option>)}</select></details><div className="row-actions"><button className="btn primary" disabled={saving||!owners.length}>{saving?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'حفظ المشروع والمتابعة':'Save project and continue')}</button>{selected&&<button type="button" className="btn" onClick={()=>setCreating(false)}>{ar?'إلغاء':'Cancel'}</button>}</div></form>}</div>:<><div className="setup-facts"><div><span>{ar?'المشروع':'Project'}</span><strong>{name(selected)}</strong></div><div><span>{ar?'الجهة المالكة':'Owner'}</span><strong>{name(owners.find(o=>o.id===selected.client_id))}</strong></div></div><p>{ar?'بيانات المشروع موجودة. انتقل لربط المواقع والأجهزة.':'Project details are recorded. Continue to its sites and devices.'}</p><button className="btn primary" onClick={()=>setStage(1)}>{ar?'متابعة إلى المواقع والأجهزة':'Continue to sites and devices'}</button></>}
     </>:!selected?<div className="setup-empty"><p>{ar?'اختر أو أنشئ المشروع أولاً.':'Select or create a project first.'}</p><button className="btn primary" onClick={()=>setStage(0)}>{ar?'اختيار المشروع':'Choose project'}</button></div>:stage===1?<>
      {task(ar?'المستشفيات والمواقع':'Hospitals and sites',counts.sites,ar?'اربط مواقع هذا المشروع قبل إضافة الأجهزة.':'Link this project’s sites before adding devices.','/sites',ar?'إدارة المواقع':'Manage sites')}
      {task(ar?'الأجهزة الطبية':'Medical devices',counts.assets,ar?'سجل الأجهزة داخل مواقع المشروع؛ لكل جهاز جواز وتاق QR.':'Register devices in the project sites; each device has a passport and QR tag.','/medical-asset-cockpit',ar?'إضافة أو مراجعة الأجهزة':'Add or review devices',counts.sites>0)}
      <details><summary>{ar?'تفاصيل المكان — مبنى، طابق، جناح، غرفة':'Location details — building, floor, wing, room'}</summary><p>{ar?'أكمل مكان الجهاز ليظهر بالتفصيل في جوازه.':'Complete the device location so it appears in its passport.'}</p><button className="btn" onClick={()=>open('/locations')}>{ar?'إدارة الهيكل المكاني':'Manage location structure'}</button></details>
      <button className="btn primary" onClick={()=>setStage(2)} disabled={!counts.sites||!counts.assets}>{ar?'متابعة إلى فريق التشغيل':'Continue to the operating team'}</button>
     </>:<>
      {task(ar?'أعضاء فرق المشروع':'Project team members',counts.team,ar?'راجع إسناد المشرف والفني وصلاحيات الوصول للمشروع.':'Review supervisor and technician assignments and project access.','/enterprise-access',ar?'مراجعة الوصول والفريق':'Review access and team')}
      {task(ar?'خطط الوقائية النشطة':'Active preventive plans',counts.ppm,ar?'اربط أجهزة المشروع بإجراءات معتمدة ثم فعّل خطة الصيانة.':'Link project devices to approved procedures, then activate maintenance plans.','/ppm',ar?'إعداد الوقائية':'Set up preventive maintenance',counts.assets>0)}
      {next===null&&<div className="setup-success">{ar?'بيانات الإعداد الأساسية موجودة. يمكنك متابعة التشغيل من ملف الجهاز.':'Basic setup records are present. Continue operations from the device record.'}</div>}
      <button className="btn primary" disabled={!counts.assets} onClick={()=>open('/medical-asset-cockpit')}>{ar?'فتح الأجهزة والصيانة':'Open devices and maintenance'}</button>
     </>}
     <details className="setup-extra"><summary>{ar?'خيارات إضافية':'More options'}</summary><div className="row-actions"><button className="btn" onClick={()=>open('/contracts')}>{ar?'العقود':'Contracts'}</button><button className="btn" onClick={()=>open('/organizations')}>{ar?'إدارة الجهات':'Organization management'}</button></div></details>
    </main>
   </div>}
  </>}
 </section>
}
