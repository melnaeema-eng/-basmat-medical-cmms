import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {Dialog,Notice,FormActions} from '../components/FacilityFields'
import DataTable from '../components/DataTable'

const emptyProjectForm=()=>({
 project_id:'',role_id:'',site_id:'',discipline_code:'',valid_from:'',valid_until:''
})

export default function UsersRoles(){
 const {profile,access,can,refreshProfile}=useAuth()
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const isPlatformAdmin=!!(profile?.is_super_admin||access?.super_admin)

 const [data,setData]=useState({users:[],organizations:[],roles:[],conflicts:[]})
 const [assignments,setAssignments]=useState([])
 const [catalog,setCatalog]=useState({projects:[],sites:[],roles:[]})
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [orgOpen,setOrgOpen]=useState(false)
 const [roleOpen,setRoleOpen]=useState(false)
 const [projectOpen,setProjectOpen]=useState(false)
 const [selected,setSelected]=useState(null)
 const [orgId,setOrgId]=useState('')
 const [transfer,setTransfer]=useState(false)
 const [roleId,setRoleId]=useState('')
 const [projectForm,setProjectForm]=useState(emptyProjectForm())

 const homeOrgId=access?.home_organization_id||null
 const targetOrg=isPlatformAdmin?null:homeOrgId

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const [dir,pa]=await Promise.all([
    supabase.rpc('bf61_users_directory',{p_org:targetOrg}),
    supabase.rpc('bf62_project_assignments_directory',{p_org:targetOrg})
   ])
   if(dir.error)throw dir.error
   if(pa.error)throw pa.error
   setData(dir.data||{users:[],organizations:[],roles:[],conflicts:[]})
   setAssignments(pa.data||[])
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 useEffect(()=>{load()},[targetOrg])

 const orgMap=useMemo(()=>Object.fromEntries((data.organizations||[]).map(x=>[x.id,x])),[data.organizations])

 const rolesForOrg=org=>(data.roles||[]).filter(r=>
  !['client_admin','client_user'].includes(r.code)&&
  (!r.organization_id||r.organization_id===org)
 )

 const canManageOrg=org=>isPlatformAdmin||!!(org&&(can('users.manage',org)||can('enterprise-access.manage',org)))

 const startOrg=user=>{
  setSelected(user)
  setOrgId(user.organization_id||(!isPlatformAdmin?homeOrgId:'')||'')
  setTransfer(false)
  setOrgOpen(true)
 }

 const saveOrg=async e=>{
  e.preventDefault()
  if(!selected||!orgId)return
  setBusy(true);setError('');setSuccess('')
  try{
   const changing=!!(selected.organization_id&&selected.organization_id!==orgId)
   const {error:e}=await supabase.rpc('bf61_set_user_organization',{
    p_user:selected.id,p_org:orgId,p_transfer:changing?transfer:false
   })
   if(e)throw e
   setOrgOpen(false)
   await load()
   if(selected.id===profile?.id)await refreshProfile()
   setSuccess(ar?'تم تثبيت المنظمة الممثلة للمستخدم.':'Represented organization saved.')
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 const startRole=user=>{
  if(!user.organization_id)return
  setSelected(user);setRoleId('');setRoleOpen(true)
 }

 const addRole=async e=>{
  e.preventDefault()
  if(!selected?.organization_id||!roleId)return
  setBusy(true);setError('');setSuccess('')
  try{
   const {error:e}=await supabase.rpc('bf3_assign_role',{
    p_user:selected.id,p_org:selected.organization_id,p_role:roleId,p_client:null
   })
   if(e)throw e
   setRoleOpen(false)
   await load()
   if(selected.id===profile?.id)await refreshProfile()
   setSuccess(ar?'تم إسناد الدور داخل منظمة المستخدم فقط.':'Role assigned inside the represented organization.')
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 const removeRole=async(user,role)=>{
  if(!window.confirm(ar?`إزالة دور ${role.name}؟`:`Remove role ${role.name}?`))return
  setBusy(true);setError('');setSuccess('')
  try{
   const {error:e}=await supabase.rpc('bf61_remove_user_role',{
    p_user:user.id,p_org:user.organization_id,p_role:role.id
   })
   if(e)throw e
   await load()
   if(user.id===profile?.id)await refreshProfile()
   setSuccess(ar?'تمت إزالة الدور.':'Role removed.')
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 const startProject=async user=>{
  if(!user.organization_id)return
  setSelected(user);setProjectForm(emptyProjectForm());setBusy(true);setError('')
  try{
   const {data:cat,error:e}=await supabase.rpc('bf62_project_access_catalog',{p_org:user.organization_id})
   if(e)throw e
   setCatalog(cat||{projects:[],sites:[],roles:[]})
   setProjectOpen(true)
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 const projectSites=useMemo(()=>{
  if(!projectForm.project_id)return []
  return (catalog.sites||[]).filter(s=>s.project_id===projectForm.project_id)
 },[catalog,projectForm.project_id])

 const assignProject=async e=>{
  e.preventDefault()
  if(!selected?.organization_id||!projectForm.project_id||!projectForm.role_id)return
  setBusy(true);setError('');setSuccess('')
  try{
   const {error:e}=await supabase.rpc('bf62_assign_project_access',{
    p_user:selected.id,
    p_org:selected.organization_id,
    p_project:projectForm.project_id,
    p_role:projectForm.role_id,
    p_site:projectForm.site_id||null,
    p_discipline:projectForm.discipline_code||null,
    p_valid_from:projectForm.valid_from||null,
    p_valid_until:projectForm.valid_until||null
   })
   if(e)throw e
   setProjectOpen(false)
   await load()
   setSuccess(ar
    ?'تم إسناد المستخدم للمشروع وربط نطاق الوصول بالمواقع المحددة.'
    :'Project assignment saved and operational access was scoped to the selected project sites.')
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 const toggleAssignment=async(a)=>{
  const next=!a.is_active
  if(!window.confirm(ar
   ?`${next?'تفعيل':'تعطيل'} إسناد ${a.project_name}؟`
   :`${next?'Activate':'Deactivate'} assignment for ${a.project_name}?`))return
  setBusy(true);setError('');setSuccess('')
  try{
   const {error:e}=await supabase.rpc('bf62_set_project_assignment_active',{p_assignment:a.id,p_active:next})
   if(e)throw e
   await load()
   setSuccess(ar?'تم تحديث إسناد المشروع.':'Project assignment updated.')
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 const orgLabel=user=>{
  if(!user.organization_id)return <span style={{color:'#a15c00',fontWeight:700}}>{ar?'غير مسند':'Unassigned'}</span>
  const o=orgMap[user.organization_id]
  return <div><strong>{o?.name||user.organization_name||'—'}</strong><div className="muted">{o?.code||user.organization_code||''}</div></div>
 }

 const roleLabels=user=>{
  const rows=user.roles||[]
  if(!rows.length)return <span className="muted">{ar?'بدون دور':'No role'}</span>
  return <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
   {rows.map(r=><span key={r.id} className="badge">
    {r.name||r.code}
    {canManageOrg(user.organization_id)&&<button type="button" onClick={()=>removeRole(user,r)}
      style={{border:0,background:'transparent',cursor:'pointer',marginInlineStart:5}}>×</button>}
   </span>)}
  </div>
 }

 const projectLabels=user=>{
  const rows=assignments.filter(a=>a.user_id===user.id)
  if(!rows.length)return <span className="muted">{ar?'بدون مشروع':'No project'}</span>
  return <div style={{display:'grid',gap:5}}>
   {rows.slice(0,3).map(a=><div key={a.id} style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
    <span className={`badge ${a.is_active?'':'muted'}`}>{a.project_code} · {a.project_name}</span>
    <span className="muted">{a.site_name|| (ar?'كل مواقع المشروع':'All project sites')}{a.discipline_code?` · ${a.discipline_code}`:''}</span>
    {canManageOrg(user.organization_id)&&<button type="button" className="btn xs secondary" onClick={()=>toggleAssignment(a)}>
     {a.is_active?(ar?'تعطيل':'Disable'):(ar?'تفعيل':'Enable')}
    </button>}
   </div>)}
   {rows.length>3&&<span className="muted">+{rows.length-3}</span>}
  </div>
 }

 const actions=user=>{
  const canOrg=isPlatformAdmin||(!user.organization_id&&homeOrgId&&can('users.manage',homeOrgId))
  const canRole=!!user.organization_id&&canManageOrg(user.organization_id)
  if(!canOrg&&!canRole)return '—'
  return <div className="row-actions">
   {canOrg&&<button type="button" className="btn xs secondary" onClick={()=>startOrg(user)}>
    {user.organization_id?(ar?'نقل المنظمة':'Transfer Org'):(ar?'إسناد المنظمة':'Assign Org')}
   </button>}
   {canRole&&<button type="button" className="btn xs secondary" onClick={()=>startRole(user)}>
    {ar?'دور المنظمة':'Org Role'}
   </button>}
   {canRole&&<button type="button" className="btn xs primary" onClick={()=>startProject(user)}>
    {ar?'إسناد مشروع':'Assign Project'}
   </button>}
  </div>
 }

 const cols=[
  {key:'full_name',label:ar?'المستخدم':'User',render:r=><div><strong>{r.full_name||'—'}</strong><div className="muted">{r.email||''}</div></div>},
  {key:'organization',label:ar?'المنظمة الممثلة':'Represented Organization',render:orgLabel},
  {key:'role',label:ar?'أدوار المنظمة':'Organization Roles',render:roleLabels},
  {key:'projects',label:ar?'المشاريع والنطاق':'Projects & Scope',render:projectLabels},
  {key:'status',label:ar?'الحالة':'Status',render:r=>r.status||'—'},
  {key:'actions',label:ar?'الإجراءات':'Actions',render:actions}
 ]

 return <section className="facility-module">
  <div className="page-head">
   <div>
    <h1>{ar?'المستخدمون والصلاحيات ونطاق المشروع':'Users, Roles & Project Access'}</h1>
    <p className="muted">{ar
     ?'المنظمة تحدد من يمثل المستخدم. إسناد المشروع يحدد أين يعمل، ودوره والموقع والتخصص يحددون نطاق عمله.'
     :'Organization defines who the user represents. Project assignment defines where they work; role, site and discipline define their working scope.'}</p>
   </div>
   <button className="btn secondary" onClick={load} disabled={busy}>{ar?'تحديث':'Refresh'}</button>
  </div>

  <Notice error={error} success={success}/>

  {(data.conflicts||[]).length>0&&isPlatformAdmin&&<div className="alert error">
   <strong>{ar?'مطلوب حسم عضوية المنظمة':'Organization membership conflict requires resolution'}</strong>
   <div>{ar
    ?`${data.conflicts.length} مستخدم لديهم سجلات قديمة في أكثر من منظمة.`
    :`${data.conflicts.length} users have legacy records in more than one organization.`}</div>
  </div>}

  <div className="facility-panel">
   <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10}}>
    <div><span className="muted">{ar?'المستخدمون':'Users'}</span><strong style={{display:'block',fontSize:22}}>{(data.users||[]).length}</strong></div>
    <div><span className="muted">{ar?'إسنادات المشاريع':'Project assignments'}</span><strong style={{display:'block',fontSize:22}}>{assignments.filter(x=>x.is_active).length}</strong></div>
    <div><span className="muted">{ar?'منظمة المستخدم الحالي':'Your organization'}</span><strong style={{display:'block'}}>{homeOrgId?(orgMap[homeOrgId]?.name||'—'):(isPlatformAdmin?(ar?'مدير المنصة':'Platform Admin'):(ar?'غير مسند':'Unassigned'))}</strong></div>
    <div><span className="muted">{ar?'القاعدة':'Rule'}</span><strong style={{display:'block'}}>{ar?'منظمة واحدة · عدة مشاريع':'One org · Multiple projects'}</strong></div>
   </div>
  </div>

  <DataTable columns={cols} rows={data.users||[]} emptyText={ar?'لا توجد بيانات':'No data'}/>

  <Dialog open={orgOpen} title={ar?'إسناد منظمة للمستخدم':'Assign User Organization'} onClose={()=>setOrgOpen(false)}>
   <form className="form-grid" onSubmit={saveOrg}>
    <label><span>{ar?'المستخدم':'User'}</span><input disabled value={selected?.email||selected?.full_name||''}/></label>
    <label><span>{ar?'المنظمة الممثلة':'Represented organization'} *</span>
     <select required value={orgId} onChange={e=>setOrgId(e.target.value)} disabled={!isPlatformAdmin&&!!homeOrgId}>
      <option value="">{ar?'اختر المنظمة':'Select organization'}</option>
      {(data.organizations||[]).map(o=><option key={o.id} value={o.id}>{o.name||o.code}</option>)}
     </select>
    </label>
    {selected?.organization_id&&selected.organization_id!==orgId&&<label className="span-2" style={{display:'flex',alignItems:'center',gap:8}}>
     <input type="checkbox" checked={transfer} onChange={e=>setTransfer(e.target.checked)} style={{width:'auto'}}/>
     <span>{ar?'تأكيد النقل مع تعطيل وصول المنظمة السابقة والإبقاء على التاريخ.':'Confirm transfer and preserve work history.'}</span>
    </label>}
    <FormActions busy={busy} onCancel={()=>setOrgOpen(false)}/>
   </form>
  </Dialog>

  <Dialog open={roleOpen} title={ar?'إسناد دور داخل المنظمة':'Assign Organization Role'} onClose={()=>setRoleOpen(false)}>
   <form className="form-grid" onSubmit={addRole}>
    <label><span>{ar?'المستخدم':'User'}</span><input disabled value={selected?.email||selected?.full_name||''}/></label>
    <label><span>{ar?'المنظمة':'Organization'}</span><input disabled value={orgMap[selected?.organization_id]?.name||selected?.organization_name||'—'}/></label>
    <label className="span-2"><span>{ar?'الدور':'Role'} *</span>
     <select required value={roleId} onChange={e=>setRoleId(e.target.value)}>
      <option value="">{ar?'اختر الدور':'Select role'}</option>
      {rolesForOrg(selected?.organization_id).map(r=><option key={r.id} value={r.id}>{r.name} · {r.code}</option>)}
     </select>
    </label>
    <FormActions busy={busy} onCancel={()=>setRoleOpen(false)}/>
   </form>
  </Dialog>

  <Dialog open={projectOpen} title={ar?'إسناد المستخدم إلى مشروع':'Assign User to Project'} onClose={()=>setProjectOpen(false)}>
   <form className="form-grid" onSubmit={assignProject}>
    <label><span>{ar?'المستخدم':'User'}</span><input disabled value={selected?.email||selected?.full_name||''}/></label>
    <label><span>{ar?'المنظمة':'Organization'}</span><input disabled value={orgMap[selected?.organization_id]?.name||selected?.organization_name||'—'}/></label>

    <label><span>{ar?'المشروع':'Project'} *</span>
     <select required value={projectForm.project_id} onChange={e=>setProjectForm({...projectForm,project_id:e.target.value,site_id:''})}>
      <option value="">{ar?'اختر المشروع':'Select project'}</option>
      {(catalog.projects||[]).map(p=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}
     </select>
    </label>

    <label><span>{ar?'دور المستخدم في المشروع':'Project role'} *</span>
     <select required value={projectForm.role_id} onChange={e=>setProjectForm({...projectForm,role_id:e.target.value})}>
      <option value="">{ar?'اختر الدور':'Select role'}</option>
      {(catalog.roles||[]).map(r=><option key={r.id} value={r.id}>{r.name} · {r.code}</option>)}
     </select>
    </label>

    <label><span>{ar?'الموقع':'Site'}</span>
     <select value={projectForm.site_id} onChange={e=>setProjectForm({...projectForm,site_id:e.target.value})} disabled={!projectForm.project_id}>
      <option value="">{ar?'كل مواقع المشروع':'All project sites'}</option>
      {projectSites.map(s=><option key={s.site_id} value={s.site_id}>{s.site_code||''} · {s.site_name}</option>)}
     </select>
    </label>

    <label><span>{ar?'التخصص / Discipline':'Discipline'}</span>
     <input value={projectForm.discipline_code} onChange={e=>setProjectForm({...projectForm,discipline_code:e.target.value})}
      placeholder={ar?'مثال: HVAC / Electrical / Biomedical':'e.g. HVAC / Electrical / Biomedical'}/>
    </label>

    <label><span>{ar?'من تاريخ':'Valid from'}</span>
     <input type="date" value={projectForm.valid_from} onChange={e=>setProjectForm({...projectForm,valid_from:e.target.value})}/>
    </label>
    <label><span>{ar?'حتى تاريخ':'Valid until'}</span>
     <input type="date" value={projectForm.valid_until} onChange={e=>setProjectForm({...projectForm,valid_until:e.target.value})}/>
    </label>

    <div className="span-2" style={{padding:10,border:'1px solid #ead78b',borderRadius:9,background:'#fff9df'}}>
     {ar
      ?'إذا تركت الموقع فارغاً، يتم منح الوصول إلى جميع المواقع المرتبطة بالمشروع فقط. التخصص يستخدم للتوجيه وتوزيع العمل ولا يغير منظمة المستخدم.'
      :'If Site is blank, access is granted to all sites linked to this project only. Discipline is used for routing and does not change the represented organization.'}
    </div>

    <FormActions busy={busy} onCancel={()=>setProjectOpen(false)}/>
   </form>
  </Dialog>
 </section>
}
