import {NavLink,Outlet,useLocation,useNavigate} from 'react-router-dom'
import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {supabase} from '../lib/supabaseClient'
import '../bafm-theme.css'

const groups=[
 {title:'Dashboard | لوحة التحكم',items:[
  ['/', 'Dashboard | لوحة التحكم', null,'home'],
 ]},
 {title:'Administration | الإدارة',items:[
  ['/project-setup','Project Setup | إعداد المشروع','organizations.view','check'],
  ['/organizations','Organizations | المنظمات','organizations.view','org'],
  ['/clients','Clients | العملاء','clients.view','client'],
  ['/enterprise-structure','Structure | الهيكل التشغيلي','enterprise-structure.view','tree'],
  ['/users','Users & Access | المستخدمون والصلاحيات','users.view','users'],
  ['/security-readiness','Security | الأمن','security.view','lock'],
  ['/release-readiness','System Readiness | جاهزية النظام','release.view','check'],
 ]},
 {title:'Core Operations | العمليات الأساسية',items:[
  ['/corrective','Work Orders | أوامر العمل','corrective.view','work'],
  ['/ppm','Preventive Maintenance | الصيانة الوقائية','ppm.view','calendar'],
  ['/field-mobile','Mobile Field | العمل الميداني','mobile-field.view','mobile'],
  ['/soft-fm','Soft FM | الخدمات المساندة','soft-fm.view','services'],
  ['/workforce','Workforce | القوى العاملة','workforce.view','users'],
  ['/planning','Operations Calendar | التقويم التشغيلي','planning.view','calendar'],
  ['/notifications','Notifications | الإشعارات','notifications.view','bell'],
 ]},
 {title:'Assets & Facilities | الأجهزة الطبية',items:[
  ['/sites','Facilities / Sites | الأجهزة الطبية والمواقع','sites.view','building'],
  ['/locations','Locations | المواقع','locations.view','pin'],
  ['/asset-categories','Asset Categories | تصنيفات الأصول','assets.view','grid'],
  ['/asset-library','Asset Library | مكتبة الأصول والصيانة','assets.view','grid'],
  ['/assets','Assets | الأصول','assets.view','asset'],
  ['/asset-lifecycle','Asset Lifecycle | دورة حياة الأصل','lifecycle.view','cycle'],
  ['/utilities','Utilities | الأجهزة الطبية الخدمية','utilities.view','bolt'],
 ]},
 {title:'Supply & Commercial | الإمداد والتجاري',items:[
  ['/inventory','Inventory | المخزون','inventory.view','box'],
  ['/advanced-stock','Advanced Stock | المخزون المتقدم','inventory.view','stack'],
  ['/procurement','Procurement | المشتريات','procurement.view','cart'],
  ['/supplier-performance','Vendors | الموردون','supplier-performance.view','truck'],
  ['/maintenance-costing','Maintenance Cost | تكاليف الصيانة','costing.view','money'],
  ['/contracts','Contracts | العقود','contracts.view','contract'],
  ['/contract-renewal','Contract Renewal | تجديد العقود','contract-renewal.view','renew'],
 ]},
 {title:'Safety & Compliance | السلامة والامتثال',items:[
  ['/hse','HSE | السلامة والصحة المهنية','hse.view','shield'],
  ['/permits','Permits | التصاريح','permit.view','permit'],
  ['/compliance','Compliance | الامتثال','compliance.view','check'],
  ['/documents','Documents | المستندات','documents.view','doc'],
  ['/document-control','Document Control | ضبط المستندات','document-control.view','folder'],
  ['/approvals','Approvals | الاعتمادات','approvals.view','approve'],
  ['/audit','Audit Log | سجل التدقيق','audit.view','audit'],
 ]},
 {title:'Performance & Analytics | الأداء والتحليلات',items:[
  ['/reports','Reports | التقارير','reports.view','report'],
  ['/kpi','KPIs | مؤشرات الأداء','kpi.view','chart'],
  ['/backlog','Backlog | الأعمال المتراكمة','backlog.view','list'],
  ['/reliability','Reliability | الاعتمادية','reliability.view','pulse'],
  ['/executive','Executive Dashboard | اللوحة التنفيذية','executive.view','dashboard'],
 ]}
]
function NavIcon({type}){
 const common={width:17,height:17,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.9,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true}
 const paths={
  home:<><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
  work:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  building:<><path d="M4 21V5l8-3v19M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/></>,
  asset:<><path d="M4 7 12 3l8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/></>,
  box:<><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></>,
  cart:<><path d="M3 4h2l2.5 11h9.5l2-7H7"/><circle cx="9" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></>,
  shield:<><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
  report:<><path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h5M8 16v-3M12 16v-6M16 16v-4"/></>,
  chart:<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  users:<><circle cx="9" cy="8" r="3"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6"/><circle cx="17" cy="9" r="2"/><path d="M15 15c3 0 5 1.5 6 5"/></>,
  bell:<><path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9Z"/><path d="M10 20h4"/></>,
  pin:<><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/></>,
  mobile:<><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/></>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  doc:<><path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
  contract:<><path d="M6 2h12v20H6V2Z"/><path d="M9 7h6M9 11h6M9 15h3"/><path d="m13 18 1.5 1.5L18 16"/></>,
  money:<><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.6-1.7-1-3-1-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 1 3 2.3-1.3 2.2-3 2.2c-1.4 0-2.5-.4-3.3-1.2M12 5v14"/></>,
  check:<><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
  folder:<><path d="M3 6h7l2 2h9v11H3V6Z"/></>,
  tree:<><path d="M12 4v5M6 20v-5h12v5M6 15v-3h12v3M12 9v3"/></>,
  cycle:<><path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M19 12a7 7 0 0 0-12-5l-2 2M5 12a7 7 0 0 0 12 5l2-2"/></>,
 }
 return <svg {...common}>{paths[type]||<><circle cx="12" cy="12" r="8"/><path d="M8 12h8"/></>}</svg>
}

export default function AppShell(){
 const {signOut,profile,user,can,access}=useAuth()
 const {lang,setLang}=useLanguage()
 const navigate=useNavigate(),location=useLocation()
 const [query,setQuery]=useState('')
 const [organizations,setOrganizations]=useState([])
 const visible=permission=>permission===null||permission==='__client__'||can(permission)
 const organizationIds=useMemo(()=>{
  if(profile?.is_super_admin||access?.super_admin)return []
  return [...new Set((access?.roles||[]).map(r=>r.organization_id).filter(Boolean))]
 },[access,profile])

 useEffect(()=>{
  let alive=true
  async function loadOrganizations(){
   try{
    let q=supabase.from('bf_organizations').select('id,name,code,status').order('name')
    if(!(profile?.is_super_admin||access?.super_admin)){
     if(!organizationIds.length){if(alive)setOrganizations([]);return}
     q=q.in('id',organizationIds)
    }
    const {data,error}=await q
    if(error)throw error
    if(alive)setOrganizations(data||[])
   }catch{
    if(alive)setOrganizations([])
   }
  }
  if(user)loadOrganizations()
  return()=>{alive=false}
 },[user,profile,access,organizationIds.join('|')])

 const displayName=profile?.full_name||user?.email||'User'
 const organizationLabel=useMemo(()=>{
  if(profile?.is_super_admin||access?.super_admin){
   return lang==='ar'?'الإدارة العامة · جميع المنظمات':'General Administration · All Organizations'
  }
  if(!organizations.length){
   return lang==='ar'?'لا توجد منظمة مرتبطة':'No organization assigned'
  }
  if(organizations.length===1)return organizations[0].name||organizations[0].code||''
  const names=organizations.slice(0,2).map(x=>x.name||x.code).filter(Boolean).join(' · ')
  return organizations.length>2
   ? `${names} +${organizations.length-2}`
   : names
 },[organizations,profile,access,lang])

 const welcomeText=lang==='ar'
  ? `مرحباً ${displayName} — ${organizationLabel}`
  : `Welcome ${displayName} — ${organizationLabel}`

 const allowed=useMemo(()=>groups.flatMap(g=>g.items).filter(x=>visible(x[2])),[can,access])
 const submit=e=>{
  e.preventDefault()
  const q=query.trim().toLowerCase()
  if(!q)return
  const hit=allowed.find(([,label])=>label.toLowerCase().includes(q))
  if(hit)navigate(hit[0])
 }

 return <div className="bafm-shell">
  <aside className="bafm-sidebar">
   <div className="bafm-logo-block">
    <img src="/bafm-logo.png" alt="BAMM"/>
    <div className="bafm-logo-word">BAMM</div>
    <div className="bafm-logo-sub">Basmat Alnawabigh</div>
    <div className="bafm-logo-tiny">Medical Equipment Maintenance Management System</div>
   </div>
   <nav className="bafm-nav">
    {groups.map(group=>{
     const items=group.items.filter(([, ,permission])=>visible(permission))
     if(!items.length)return null
     return <section className="bafm-nav-section" key={group.title}>
      <div className="bafm-nav-title">{group.title}</div>
      {items.map(([to,label,,icon])=><NavLink key={to} end={to==='/'}
       to={to} className={({isActive})=>'bafm-nav-item '+(isActive?'active':'')}>
       <span className="bafm-nav-icon"><NavIcon type={icon}/></span>
       <span>{label}</span>
      </NavLink>)}
     </section>
    })}
   </nav>
   <div className="bafm-sidebar-footer">BAMM · v1.0</div>
  </aside>

  <div className="bafm-main">
   <header className="bafm-topbar">
    <div className="bafm-top-title">
     <strong>Basmat Medical Equipment CMMS</strong>
     <span>| بصمة النوابغ لإدارة صيانة الأجهزة الطبية</span>
    </div>
    <form className="bafm-search" onSubmit={submit}>
     <NavIcon type="report"/>
     <input value={query} onChange={e=>setQuery(e.target.value)}
      placeholder={lang==='ar'?'البحث في أوامر العمل والأجهزة الطبية...':'Search work orders, assets, facilities...'}/>
    </form>
    <div className="bafm-top-actions">
     <button className="bafm-top-btn" onClick={()=>setLang(lang==='ar'?'en':'ar')}>{lang==='ar'?'EN':'عربي'}</button>
     <button className="bafm-bell" onClick={()=>navigate('/notifications')} aria-label="Notifications"><NavIcon type="bell"/><span>•</span></button>
     <div className="bafm-user">
      <div className="bafm-avatar">{displayName.slice(0,1).toUpperCase()}</div>
      <div>
       <strong>{displayName}</strong>
       <small>{organizationLabel}</small>
      </div>
     </div>
     <button className="bafm-signout" onClick={signOut}>↪</button>
    </div>
   </header>
   <div style={{
    margin:'12px 22px 0',
    padding:'12px 16px',
    borderRadius:14,
    background:'linear-gradient(135deg, rgba(8,34,75,.06), rgba(30,136,229,.08))',
    border:'1px solid rgba(8,34,75,.10)',
    fontWeight:700,
    color:'#08224b',
    display:'flex',
    alignItems:'center',
    gap:8
   }}>
    <span aria-hidden="true">👋</span>
    <span>{welcomeText}</span>
   </div>
   <main className="bafm-content" key={location.pathname}><Outlet/></main>
  </div>
 </div>
}
