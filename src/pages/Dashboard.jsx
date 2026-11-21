import {useEffect,useState} from 'react'
import {Link,useOutletContext} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import DashboardIdentity from '../components/DashboardIdentity'

const closed=['closed','cancelled']
const complete=['completed','approved','closed']

export default function Dashboard(){
 const {profile,can}=useAuth(),{lang}=useLanguage()
 const {companyId:organizationId}=useOutletContext()
 const ar=lang==='ar'
 const [loading,setLoading]=useState(true)
 const [data,setData]=useState({total:0,completed:0,progress:0,overdue:0,open:0,critical:0,assets:0,ppmTotal:0,ppmCompleted:0,ppmOverdue:0,ppmPending:0,rows:[],assetsById:{}})
 const [error,setError]=useState('')

 const [workTab,setWorkTab]=useState('all')
 useEffect(()=>{
  if(!organizationId){setLoading(false);return}
  let alive=true, pending=false
  async function load(){
   if(pending)return
   pending=true
   try{
    const {data:dashboard,error}=await supabase.rpc('bf_med_workspace_dashboard',{p_org:organizationId})
    if(error)throw error
    if(alive){setData(dashboard);setError('')}
   }catch(e){
    if(alive)setError(e.message)
   }finally{
    pending=false
    if(alive)setLoading(false)
   }
  }

  const refresh=()=>load()

  load()
  window.addEventListener('focus',refresh)
  const timer=window.setInterval(refresh,15000)

  return()=>{
   alive=false
   window.removeEventListener('focus',refresh)
   window.clearInterval(timer)
  }
 },[organizationId])
 const ppmCompliance=data.ppmTotal?Math.round(data.ppmCompleted/data.ppmTotal*100):0
 const greeting=profile?.full_name||'BAMM User'
 const open=data.open
 const critical=data.critical
 const filteredRows=data.rows.filter(x=>{
  if(workTab==='open') return !closed.includes(x.status)
  if(workTab==='progress') return x.status==='in_progress'
  if(workTab==='overdue') return x.sla_status==='breached'
  if(workTab==='completed') return complete.includes(x.status)
  return true
 }).slice(0,7)
 const metric=(value,allowed)=>loading?'…':error||!allowed?'—':value
 const complianceLabel=metric(ppmCompliance+'%',data.canPpm)
 const alerts=[
  [metric(data.overdue,data.canWork),'work orders overdue','أوامر عمل متأخرة','critical'],
  [critical,'critical work orders','أوامر عمل حرجة','warning'],
  [data.ppmOverdue,'preventive jobs overdue','صيانة وقائية متأخرة','warning'],
 ]
 const quick=[
  ['/medical-asset-cockpit','＋','Open Device & Start Maintenance','فتح جهاز وبدء الصيانة','assets.view'],
  ['/approvals','✓','Review Completed Work','مراجعة الإنجاز','approvals.view'],
  ['/documents','▥','Reports & Certificates','التقارير والشهادات','documents.view'],
 ].filter(x=>organizationId&&can(x[4],organizationId))
 return <section className="bafm-dashboard">
   <DashboardIdentity/>
  <div className="bafm-hero" style={{backgroundImage:"linear-gradient(90deg,rgba(7,39,68,.24),rgba(0,87,126,.08)),url('/images/medical-dashboard-hero-clear.png')",backgroundSize:"cover",backgroundPosition:"center"}}>
   <div className="bafm-hero-copy">
    <span>WELCOME BACK</span>
    <h1>{greeting} <small>مرحباً بك مجدداً</small></h1>
    <i/>
    <p>Together for safer, smarter and more reliable medical equipment</p>
    <p className="ar">معاً نحو أجهزة طبية أكثر أماناً وكفاءة واستدامة</p>
   </div>
   <div className="bafm-hero-tag"><strong>رعاية الأجهزة الطبية اليوم<br/>لمستقبل علاجي أفضل غداً</strong><span>Today's Medical Equipment<br/>for Better Care Tomorrow</span><i/></div>
  </div>

  {error&&<div className="bafm-error" role="alert">{ar?'تعذّر تحميل بيانات لوحة المعلومات.':'Dashboard data could not be loaded.'}</div>}
  {!organizationId&&<div className="bafm-panel"><Link to="/maintenance-companies">{ar?'افتح مساحة شركة لعرض لوحة المعلومات.':'Open a company workspace to view its dashboard.'}</Link></div>}
  {!loading&&!error&&organizationId&&!data.companyWide&&!data.assignedProjects&&<div className="bafm-panel">{ar?'لا توجد مشاريع طبية مسندة لحسابك. تواصل مع أدمن الشركة لإسناد المشروع.':'No Medical projects are assigned to your account. Contact your company administrator for an assignment.'}</div>}


  <div className="bafm-kpi-grid">
   {[
    ['doc','Total Work Orders','إجمالي أوامر العمل',metric(data.total,data.canWork),'blue'],
    ['check','Completed','تم الإغلاق',metric(data.completed,data.canWork),'green'],
    ['clock','In Progress','قيد التنفيذ',metric(data.progress,data.canWork),'orange'],
    ['alert','Overdue','متأخر',metric(data.overdue,data.canWork),'red'],
    ['tools','PM Compliance','الالتزام بالصيانة الوقائية',complianceLabel,'light'],
    ['building','Total Medical Equipment','إجمالي الأجهزة الطبية',metric(data.assets,data.canAssets),'soft'],
   ].map(([icon,en,ar,val,tone])=><div className="bafm-kpi" key={en}>
    <div className={'bafm-kpi-icon '+tone}>{icon==='check'?'✓':icon==='clock'?'◷':icon==='alert'?'!':icon==='tools'?'⚙':icon==='building'?'▥':'▤'}</div>
    <div><span>{en}<small>{ar}</small></span><strong>{val}</strong><em>{val===0||val==='—'||val==='…'?'—':'Live'} <small>بيانات حية</small></em></div>
   </div>)}
  </div>

  {!loading&&!error&&(data.canWork||data.canPpm)&&<div className="bafm-dashboard-grid">
   {data.canWork&&<div className="bafm-panel bafm-work-panel">
    <div className="bafm-panel-head"><h2>Medical Maintenance Work Orders <span>| أوامر صيانة الأجهزة الطبية</span></h2><Link to="/corrective">View All | عرض الكل</Link></div>
    <div className="bafm-tabs">
     <button type="button" className={workTab==='all'?'active':''} onClick={()=>setWorkTab('all')}>All ({data.total})</button>
     <button type="button" className={workTab==='open'?'active':''} onClick={()=>setWorkTab('open')}>Open ({open})</button>
     <button type="button" className={workTab==='progress'?'active':''} onClick={()=>setWorkTab('progress')}>In Progress ({data.progress})</button>
     <button type="button" className={workTab==='overdue'?'active':''} onClick={()=>setWorkTab('overdue')}>Overdue ({data.overdue})</button>
     <button type="button" className={workTab==='completed'?'active':''} onClick={()=>setWorkTab('completed')}>Completed ({data.completed})</button>
    </div>
    <div className="bafm-table-wrap"><table className="bafm-table">
     <thead><tr><th>#</th><th>Title | العنوان</th><th>Priority | الأولوية</th><th>Status | الحالة</th><th>Medical Equipment | الجهاز الطبي</th><th>Due Date | الاستحقاق</th></tr></thead>
     <tbody>{filteredRows.length?filteredRows.map(x=>{
      const a=data.assetsById[x.asset_id]
      return <tr key={x.id}><td><Link to={'/corrective/work_order/'+x.id}>{x.work_order_number}</Link></td><td>{x.title}</td>
       <td><span className={'bafm-chip p-'+x.priority.toLowerCase()}>{x.priority==='P1'?'High | عالية':x.priority==='P2'?'High | عالية':x.priority==='P3'?'Medium | متوسطة':'Low | منخفضة'}</span></td>
       <td><span className={'bafm-chip s-'+x.status}>{x.status.replaceAll('_',' ')}</span></td>
       <td>{a?.asset_tag||'—'}<small>{a?.name_en||a?.name_ar||''}</small></td>
       <td>{x.completion_due_at?new Date(x.completion_due_at).toLocaleDateString(lang):'—'}</td></tr>
     }):<tr><td colSpan="6" className="bafm-empty">No medical maintenance work orders yet | لا توجد أوامر صيانة أجهزة طبية</td></tr>}</tbody>
    </table></div>
   </div>}

   <div className="bafm-right-stack">
    {data.canPpm&&<div className="bafm-panel">
     <div className="bafm-panel-head"><h2>Medical Equipment Preventive Maintenance <span>| الصيانة الوقائية للأجهزة الطبية</span></h2><small>All scheduled jobs | جميع المهام المجدولة</small></div>
     <div className="bafm-pm">
      <div className="bafm-donut" style={{'--pct':ppmCompliance}}><div><strong>{ppmCompliance}%</strong><span>Compliance<br/>الالتزام</span></div></div>
      <ul><li><i className="navy"/>Scheduled <span>مجدولة</span><b>{data.ppmPending}</b></li><li><i className="green"/>Completed <span>مكتملة</span><b>{data.ppmCompleted}</b></li><li><i className="red"/>Overdue <span>متأخرة</span><b>{data.ppmOverdue}</b></li></ul>
     </div>
    </div>}
    <div className="bafm-panel">
     <div className="bafm-panel-head"><h2>Medical Equipment SLA & Alerts <span>| تنبيهات مستوى خدمة الأجهزة الطبية</span></h2></div>
     <div className="bafm-alerts">{alerts.map(([n,en,ar,tone])=><div key={en} className="bafm-alert-row"><i className={tone}>{tone==='critical'?'!':'△'}</i><div><strong>{n} {en}</strong><span>{n} {ar}</span></div><em className={tone}>{tone==='critical'?'Critical | حرجة':'Warning | تحذير'}</em><b>›</b></div>)}</div>
    </div>
   </div>
  </div>}

  {!!quick.length&&<div className="bafm-panel bafm-quick-panel"><div className="bafm-panel-head"><h2>Medical Quick Actions <span>| إجراءات طبية سريعة</span></h2></div><div className="bafm-quick-grid">
   {quick.map(([to,icon,en,ar])=><Link to={to} key={en} className="bafm-quick"><b>{icon}</b><strong>{en}</strong><span>{ar}</span></Link>)}
  </div></div>}
  <div className="bafm-dashboard-footer"><span>BAMM | Basmat Medical Equipment CMMS</span><span>People | Medical Equipment | Safety | Reliability · الأفراد | الأجهزة الطبية | السلامة | الاعتمادية</span></div>
 </section>
}
