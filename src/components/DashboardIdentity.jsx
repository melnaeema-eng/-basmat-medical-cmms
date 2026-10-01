import {useMemo} from 'react'
import {useAuth} from '../context/AuthContext'

export default function DashboardIdentity(){
 const {profile,user,access}=useAuth()

 const org=useMemo(()=>{
  const selected=localStorage.getItem('basmat.active.organization')
  return (access?.organizations||[]).find(x=>(x.organization_id||x.id)===selected)
    ||(access?.organizations||[])[0]
    ||null
 },[access])

 const orgId=org?.organization_id||org?.id||null

 const roles=[...new Map(
  (access?.role_assignments||[])
   .filter(x=>!orgId||x.organization_id===orgId)
   .map(x=>[x.role_id,x])
 ).values()]

 const projects=[...new Map(
  (access?.projects||[])
   .filter(x=>!orgId||x.organization_id===orgId)
   .map(x=>[x.project_id,x])
 ).values()]

 const name=profile?.full_name||user?.email||'User'
 const orgName=org?.name_ar||org?.name||org?.name_en||org?.code||''
 const roleText=roles.map(r=>r.role_name_ar||r.role_name_en||r.role_code).join(' • ')
 const projectText=projects.map(p=>p.name||p.project_code).join(' • ')

 return <div className="facility-panel" style={{marginBottom:18}}>
  <h2 style={{margin:'0 0 8px'}}>
   مرحباً {name}{orgName?` — ${orgName}`:''}
  </h2>
  <div>
   <strong>الأدوار:</strong>{' '}
   {access?.super_admin?'Super Admin':(roleText||'—')}
  </div>
  <div style={{marginTop:5}}>
   <strong>المشروع{projects.length>1?'ات':''}:</strong>{' '}
   {access?.super_admin?'جميع المشاريع':(projectText||'—')}
  </div>
 </div>
}
