import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {Dialog,Notice,FormActions} from '../components/FacilityFields'
import DataTable from '../components/DataTable'

export default function UsersRoles(){
 const {profile,access,can,refreshProfile}=useAuth()
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const isPlatformAdmin=!!(profile?.is_super_admin||access?.super_admin)

 const [data,setData]=useState({users:[],organizations:[],roles:[],conflicts:[]})
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [orgOpen,setOrgOpen]=useState(false)
 const [roleOpen,setRoleOpen]=useState(false)
 const [selected,setSelected]=useState(null)
 const [orgId,setOrgId]=useState('')
 const [transfer,setTransfer]=useState(false)
 const [roleId,setRoleId]=useState('')

 const homeOrgId=access?.home_organization_id||null
 const targetOrg=isPlatformAdmin?null:homeOrgId

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const {data:result,error:e}=await supabase.rpc('bf61_users_directory',{p_org:targetOrg})
   if(e)throw e
   setData(result||{users:[],organizations:[],roles:[],conflicts:[]})
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 useEffect(()=>{load()},[targetOrg])

 const orgMap=useMemo(()=>Object.fromEntries((data.organizations||[]).map(x=>[x.id,x])),[data.organizations])

 const rolesForOrg=org=>(data.roles||[]).filter(r=>
  !['client_admin','client_user'].includes(r.code)&&
  (!r.organization_id||r.organization_id===org)
 )

 const canManageOrg=org=>isPlatformAdmin||!!(org&&can('users.manage',org))

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
    p_user:selected.id,
    p_org:orgId,
    p_transfer:changing?transfer:false
   })
   if(e)throw e
   setOrgOpen(false)
   await load()
   if(selected.id===profile?.id)await refreshProfile()
   setSuccess(ar
    ?'تم تثبيت المنظمة الممثلة للمستخدم. لا يمكنه العمل كعضو نشط في منظمة أخرى.'
    :'The user organization is fixed. The user cannot be active in another organization.')
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
    p_user:selected.id,
    p_org:selected.organization_id,
    p_role:roleId,
    p_client:null
   })
   if(e)throw e
   setRoleOpen(false)
   await load()
   if(selected.id===profile?.id)await refreshProfile()
   setSuccess(ar?'تم إسناد الصلاحية داخل منظمة المستخدم فقط.':'Role assigned inside the user organization only.')
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
    {canManageOrg(user.organization_id)&&<button
      type="button"
      onClick={()=>removeRole(user,r)}
      style={{border:0,background:'transparent',cursor:'pointer',marginInlineStart:5}}
      aria-label={ar?'إزالة الدور':'Remove role'}>×</button>}
   </span>)}
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
   {canRole&&<button type="button" className="btn xs primary" onClick={()=>startRole(user)}>
    {ar?'إسناد دور':'Assign Role'}
   </button>}
  </div>
 }

 const cols=[
  {key:'full_name',label:ar?'المستخدم':'User',render:r=><div><strong>{r.full_name||'—'}</strong><div className="muted">{r.email||''}</div></div>},
  {key:'organization',label:ar?'المنظمة الممثلة':'Represented Organization',render:orgLabel},
  {key:'role',label:ar?'الأدوار داخل المنظمة':'Roles in Organization',render:roleLabels},
  {key:'status',label:ar?'الحالة':'Status',render:r=>r.status||'—'},
  {key:'actions',label:ar?'الإجراءات':'Actions',render:actions}
 ]

 return <section className="facility-module">
  <div className="page-head">
   <div>
    <h1>{ar?'المستخدمون والمنظمة والصلاحيات':'Users, Organization & Access'}</h1>
    <p className="muted">{ar
     ?'كل مستخدم يمثل منظمة واحدة فقط. يمكن إعطاؤه عدة أدوار داخل منظمته وإسناده لاحقاً لعدة مشاريع دون تغيير منظمته.'
     :'Each user represents one organization only. Multiple roles can be assigned inside that organization, and project assignments do not change the represented organization.'}</p>
   </div>
   <button className="btn secondary" onClick={load} disabled={busy}>{ar?'تحديث':'Refresh'}</button>
  </div>

  <Notice error={error} success={success}/>

  {(data.conflicts||[]).length>0&&isPlatformAdmin&&<div className="alert error">
   <strong>{ar?'مطلوب حسم عضوية المنظمة':'Organization membership conflict requires resolution'}</strong>
   <div>{ar
    ?`${data.conflicts.length} مستخدم لديهم سجلات قديمة في أكثر من منظمة. اختر منظمة واحدة لكل مستخدم باستخدام "نقل المنظمة".`
    :`${data.conflicts.length} users have legacy records in more than one organization. Choose one organization for each user using "Transfer Org".`}</div>
  </div>}

  <div className="facility-panel">
   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10}}>
    <div><span className="muted">{ar?'المستخدمون':'Users'}</span><strong style={{display:'block',fontSize:22}}>{(data.users||[]).length}</strong></div>
    <div><span className="muted">{ar?'منظمة المستخدم الحالي':'Your organization'}</span><strong style={{display:'block'}}>{homeOrgId?(orgMap[homeOrgId]?.name||'—'):(isPlatformAdmin?(ar?'مدير المنصة':'Platform Admin'):(ar?'غير مسند':'Unassigned'))}</strong></div>
    <div><span className="muted">{ar?'قاعدة العضوية':'Membership rule'}</span><strong style={{display:'block'}}>{ar?'منظمة نشطة واحدة فقط':'One active organization only'}</strong></div>
   </div>
  </div>

  <DataTable columns={cols} rows={data.users||[]} emptyText={ar?'لا توجد بيانات':'No data'}/>

  <Dialog open={orgOpen} title={ar?'إسناد منظمة للمستخدم':'Assign User Organization'} onClose={()=>setOrgOpen(false)}>
   <form className="form-grid" onSubmit={saveOrg}>
    <label>
     <span>{ar?'المستخدم':'User'}</span>
     <input disabled value={selected?.email||selected?.full_name||''}/>
    </label>
    <label>
     <span>{ar?'المنظمة الممثلة':'Represented organization'} *</span>
     <select required value={orgId} onChange={e=>setOrgId(e.target.value)} disabled={!isPlatformAdmin&&!!homeOrgId}>
      <option value="">{ar?'اختر المنظمة':'Select organization'}</option>
      {(data.organizations||[]).map(o=><option key={o.id} value={o.id}>{o.name||o.code}</option>)}
     </select>
    </label>
    {selected?.organization_id&&selected.organization_id!==orgId&&<label className="span-2" style={{display:'flex',alignItems:'center',gap:8}}>
     <input type="checkbox" checked={transfer} onChange={e=>setTransfer(e.target.checked)} style={{width:'auto'}}/>
     <span>{ar
      ?'تأكيد النقل: تعطيل صلاحيات وعضويات المنظمة السابقة مع الإبقاء على تاريخ الأعمال.'
      :'Confirm transfer: disable previous organization access while preserving work history.'}</span>
    </label>}
    <FormActions busy={busy} onCancel={()=>setOrgOpen(false)}/>
   </form>
  </Dialog>

  <Dialog open={roleOpen} title={ar?'إسناد دور داخل المنظمة':'Assign Role in Organization'} onClose={()=>setRoleOpen(false)}>
   <form className="form-grid" onSubmit={addRole}>
    <label>
     <span>{ar?'المستخدم':'User'}</span>
     <input disabled value={selected?.email||selected?.full_name||''}/>
    </label>
    <label>
     <span>{ar?'المنظمة':'Organization'}</span>
     <input disabled value={orgMap[selected?.organization_id]?.name||selected?.organization_name||'—'}/>
    </label>
    <label className="span-2">
     <span>{ar?'الدور':'Role'} *</span>
     <select required value={roleId} onChange={e=>setRoleId(e.target.value)}>
      <option value="">{ar?'اختر الدور':'Select role'}</option>
      {rolesForOrg(selected?.organization_id).map(r=><option key={r.id} value={r.id}>{r.name} · {r.code}</option>)}
     </select>
    </label>
    <FormActions busy={busy} onCancel={()=>setRoleOpen(false)}/>
   </form>
  </Dialog>
 </section>
}
