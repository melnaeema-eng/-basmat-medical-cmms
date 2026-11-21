import {useOutletContext} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'

export default function DashboardIdentity(){
 const {profile,user,access}=useAuth()
 const {lang}=useLanguage(),ar=lang==='ar'

 const {company:org,companyId:orgId}=useOutletContext()

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
 const orgName=(ar?org?.name_ar||org?.name||org?.name_en:org?.name_en||org?.name||org?.name_ar)||org?.code||''
 const roleText=roles.map(r=>r.role_code==='org_admin'?(ar?'أدمن الشركة':'Company admin'):((ar?r.role_name_ar||r.role_name_en:r.role_name_en||r.role_name_ar)||r.role_code)).filter(Boolean).join(' • ')
 const projectText=projects.map(p=>p.name||p.project_code).join(' • ')

 return <div className="facility-panel" style={{marginBottom:18}}>
  <h2 style={{margin:'0 0 8px'}}>
   {ar?'مرحباً':'Welcome'} {name}{orgName?` — ${orgName}`:''}
  </h2>
  <div>
   <strong>{ar?'الأدوار:':'Roles:'}</strong>{' '}
   {access?.super_admin?'Super Admin':(roleText||'—')}
  </div>
  <div style={{marginTop:5}}>
   <strong>{ar?(projects.length>1?'المشروعات:':'المشروع:'):'Projects:'}</strong>{' '}
   {access?.super_admin?(ar?'كل مشاريع الشركة الحالية':'All projects in the current company'):(projectText||'—')}
  </div>
 </div>
}
