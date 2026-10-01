import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'

export default function RolesPermissions(){
 const {access}=useAuth()
 const [org,setOrg]=useState('')
 const [data,setData]=useState(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const orgs=access?.organizations||[]

 useEffect(()=>{
  if(!org&&orgs.length)setOrg(orgs[0].organization_id||orgs[0].id||'')
 },[org,orgs])

 async function load(){
  if(!org)return
  setBusy(true);setError('')
  const {data:d,error:e}=await supabase.rpc('bf_acl_admin_matrix',{p_org:org})
  setBusy(false)
  if(e){setError(e.message);return}
  if(d?.error){setError(d.error);return}
  setData(d)
 }

 useEffect(()=>{load()},[org])

 const userRoles=userId=>new Set(
  (data?.user_roles||[]).filter(x=>x.user_id===userId&&x.is_active).map(x=>x.role_id)
 )
 const userProjects=userId=>new Set(
  (data?.user_projects||[]).filter(x=>x.user_id===userId&&x.is_active).map(x=>x.project_id)
 )

 async function setRole(userId,roleId,enabled){
  setBusy(true);setError('')
  const {error:e}=await supabase.rpc('bf_acl_set_user_role',{
   p_org:org,p_user:userId,p_role:roleId,p_enabled:enabled
  })
  setBusy(false)
  if(e){setError(e.message);return}
  await load()
 }

 async function setProject(userId,projectId,enabled){
  setBusy(true);setError('')
  const {error:e}=await supabase.rpc('bf_acl_set_user_project',{
   p_org:org,p_user:userId,p_project:projectId,p_module:'shared',
   p_site:null,p_discipline:null,p_enabled:enabled
  })
  setBusy(false)
  if(e){setError(e.message);return}
  await load()
 }

 async function setPermission(roleId,key,allowed){
  setBusy(true);setError('')
  const {error:e}=await supabase.rpc('bf_acl_set_role_permission',{
   p_role:roleId,p_permission:key,p_allowed:allowed
  })
  setBusy(false)
  if(e){setError(e.message);return}
  await load()
 }

 return <section className="facility-panel">
  <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
   <h1 style={{marginInlineEnd:'auto'}}>الأدوار والصلاحيات | Roles & Permissions</h1>
   <select value={org} onChange={e=>setOrg(e.target.value)}>
    {orgs.map(o=><option key={o.organization_id||o.id} value={o.organization_id||o.id}>
     {o.name_ar||o.name||o.name_en||o.code}
    </option>)}
   </select>
   <button onClick={load} disabled={busy}>تحديث</button>
  </div>

  {error&&<div className="bafm-error">{error}</div>}
  {busy&&<p>جاري التحميل...</p>}

  {data&&<>
   <h2>تعيين الأدوار للمستخدمين</h2>
   <div style={{overflowX:'auto'}}>
    <table className="facility-table">
     <thead><tr>
      <th>المستخدم</th>
      {data.roles.map(r=><th key={r.id}>{r.role_name_ar}<br/><small>{r.role_name_en}</small></th>)}
     </tr></thead>
     <tbody>{data.users.map(u=>{
      const current=userRoles(u.user_id)
      return <tr key={u.user_id}>
       <td><strong>{u.full_name||u.email}</strong><br/><small>{u.email}</small></td>
       {data.roles.map(r=><td key={r.id} style={{textAlign:'center'}}>
        <input type="checkbox" checked={current.has(r.id)} disabled={busy}
         onChange={e=>setRole(u.user_id,r.id,e.target.checked)}/>
       </td>)}
      </tr>
     })}</tbody>
    </table>
   </div>

   <h2 style={{marginTop:28}}>نطاق المشاريع</h2>
   <div style={{overflowX:'auto'}}>
    <table className="facility-table">
     <thead><tr>
      <th>المستخدم</th>
      {data.projects.map(p=><th key={p.project_id}>{p.name}<br/><small>{p.project_code}</small></th>)}
     </tr></thead>
     <tbody>{data.users.map(u=>{
      const current=userProjects(u.user_id)
      return <tr key={u.user_id}>
       <td>{u.full_name||u.email}</td>
       {data.projects.map(p=><td key={p.project_id} style={{textAlign:'center'}}>
        <input type="checkbox" checked={current.has(p.project_id)} disabled={busy}
         onChange={e=>setProject(u.user_id,p.project_id,e.target.checked)}/>
       </td>)}
      </tr>
     })}</tbody>
    </table>
   </div>

   <h2 style={{marginTop:28}}>مصفوفة صلاحيات الأدوار</h2>
   <p>
    {access?.super_admin
      ?'Super Admin: يمكنك تعديل القالب العام للدور.'
      :'عرض فقط. تعديل قالب الدور العام متاح لـ Super Admin فقط.'}
   </p>

   <div style={{overflowX:'auto',maxHeight:'60vh'}}>
    <table className="facility-table">
     <thead><tr>
      <th>الصلاحية</th>
      {data.roles.map(r=><th key={r.id}>{r.role_name_ar}</th>)}
     </tr></thead>
     <tbody>{data.permissions.map(p=><tr key={p.permission_key}>
      <td>
       <strong>{p.description_ar||p.permission_key}</strong><br/>
       <small>{p.permission_key}</small>
      </td>
      {data.roles.map(r=>{
       const rp=data.role_permissions.find(x=>x.role_id===r.id&&x.permission_key===p.permission_key)
       return <td key={r.id} style={{textAlign:'center'}}>
        <input type="checkbox"
         checked={!!rp?.is_allowed}
         disabled={busy||!access?.super_admin||!p.organization_allowed}
         onChange={e=>setPermission(r.id,p.permission_key,e.target.checked)}/>
       </td>
      })}
     </tr>)}</tbody>
    </table>
   </div>
  </>}
 </section>
}
