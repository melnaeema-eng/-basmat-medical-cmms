import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'

const closed=['closed','cancelled']
const complete=['completed','approved','closed']
const bilingual=(en,ar)=><>{en}<span className="bafm-bi">{ar}</span></>

export default function Dashboard(){
 const {profile,can}=useAuth(),{lang}=useLanguage()
 const [data,setData]=useState({total:0,completed:0,progress:0,overdue:0,open:0,critical:0,assets:0,ppmTotal:0,ppmCompleted:0,ppmOverdue:0,ppmPending:0,rows:[],assetsById:{}})
 const [error,setError]=useState('')
 const [workTab,setWorkTab]=useState('all')
 useEffect(()=>{
  let alive=true

  async function rows(table,columns='*',build){
   const all=[]
   for(let start=0;start<100000;start+=500){
    let q=supabase.from(table).select(columns).range(start,start+499)
    q=build?build(q):q
    const {data,error}=await q
    if(error)throw error
    all.push(...(data||[]))
    if((data||[]).length<500)return all
   }
   throw Error('Dataset limit reached. Apply a narrower filter.')
  }

  async function load(){
   setError('')
   try{
    const [workOrders,assetsRows,ppmJobs]=await Promise.all([
     rows(
      'bf_work_orders',
      'id,work_order_number,title,priority,status,sla_status,asset_id,completion_due_at,created_at',
      q=>q.order('created_at',{ascending:false})
     ),
     rows(
      'bf_assets',
      'id,asset_tag,name_ar,name_en,status',
      q=>q.eq('status','active')
     ),
     rows(
      'bf_ppm_jobs',
      'id,status,due_date,created_at',
      q=>q.neq('status','cancelled')
     )
    ])

    const today=new Date().toISOString().slice(0,10)
    const total=workOrders.length
    const completed=workOrders.filter(x=>complete.includes(x.status)).length
    const progress=workOrders.filter(x=>x.status==='in_progress').length
    const overdue=workOrders.filter(x=>x.sla_status==='breached').length
    const open=workOrders.filter(x=>!closed.includes(x.status)).length
    const critical=workOrders.filter(x=>x.priority==='P1'&&!closed.includes(x.status)).length
const ppmTotal=ppmJobs.length
    const ppmCompleted=ppmJobs.filter(x=>complete.includes(x.status)).length
    const ppmOverdue=ppmJobs.filter(x=>x.status==='scheduled'&&x.due_date&&x.due_date<today).length
    const ppmPending=ppmJobs.filter(x=>!complete.includes(x.status)).length

    const rows7=workOrders.slice(0,7)
    const assetsById=Object.fromEntries(assetsRows.map(x=>[x.id,x]))

    if(alive)setData({
     total,completed,progress,overdue,open,critical,
     assets:assetsRows.length,
     ppmTotal,ppmCompleted,ppmOverdue,ppmPending,
     rows:rows7,
     assetsById
    })
   }catch(e){
    if(alive)setError(e.message)
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
 },[])
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
 })
 const alerts=[
  [data.overdue,'work orders overdue','أوامر عمل متأخرة','critical'],
  [critical,'critical work orders','أوامر عمل حرجة','warning'],
  [data.ppmOverdue,'preventive jobs overdue','صيانة وقائية متأخرة','warning'],
 ]
 const quick=[
  ['/corrective','＋','Create Work Order','إنشاء أمر عمل','corrective.manage'],
  ['/ppm','◫','Schedule PM','جدولة صيانة وقائية','ppm.manage'],
  ['/procurement','□','Request Spare Part','طلب قطعة غيار','procurement.view'],
  ['/corrective','◎','New Service Request','طلب خدمة جديد','corrective.request'],
  ['/hse','△','Report Equipment Incident','بلاغ حادث جهاز','hse.view'],
  ['/reports','▥','Open Reports','فتح التقارير','reports.view'],
 ].filter(x=>can(x[4]))
 return <section className="bafm-dashboard">
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

  {error&&<div className="bafm-error">{error}</div>}

  <div className="bafm-kpi-grid">
   {[
    ['doc','Total Work Orders','إجمالي أوامر العمل',data.total,'blue'],
    ['check','Completed','تم الإغلاق',data.completed,'green'],
    ['clock','In Progress','قيد التنفيذ',data.progress,'orange'],
    ['alert','Overdue','متأخر',data.overdue,'red'],
    ['tools','PM Compliance','الالتزام بالصيانة الوقائية',ppmCompliance+'%','light'],
    ['building','Total Medical Equipment','إجمالي الأجهزة الطبية',data.assets,'soft'],
   ].map(([icon,en,ar,val,tone])=><div className="bafm-kpi" key={en}>
    <div className={'bafm-kpi-icon '+tone}>{icon==='check'?'✓':icon==='clock'?'◷':icon==='alert'?'!':icon==='tools'?'⚙':icon==='building'?'▥':'▤'}</div>
    <div><span>{en}<small>{ar}</small></span><strong>{val}</strong><em>{val===0?'—':'Live'} <small>بيانات حية</small></em></div>
   </div>)}
  </div>

  <div className="bafm-dashboard-grid">
   <div className="bafm-panel bafm-work-panel">
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
   </div>

   <div className="bafm-right-stack">
    <div className="bafm-panel">
     <div className="bafm-panel-head"><h2>Medical Equipment Preventive Maintenance <span>| الصيانة الوقائية للأجهزة الطبية</span></h2><small>This Month | هذا الشهر</small></div>
     <div className="bafm-pm">
      <div className="bafm-donut" style={{'--pct':ppmCompliance}}><div><strong>{ppmCompliance}%</strong><span>Compliance<br/>الالتزام</span></div></div>
      <ul><li><i className="navy"/>Scheduled <span>مجدولة</span><b>{data.ppmPending}</b></li><li><i className="green"/>Completed <span>مكتملة</span><b>{data.ppmCompleted}</b></li><li><i className="red"/>Overdue <span>متأخرة</span><b>{data.ppmOverdue}</b></li></ul>
     </div>
    </div>
    <div className="bafm-panel">
     <div className="bafm-panel-head"><h2>Medical Equipment SLA & Alerts <span>| تنبيهات مستوى خدمة الأجهزة الطبية</span></h2></div>
     <div className="bafm-alerts">{alerts.map(([n,en,ar,tone])=><div key={en} className="bafm-alert-row"><i className={tone}>{tone==='critical'?'!':'△'}</i><div><strong>{n} {en}</strong><span>{n} {ar}</span></div><em className={tone}>{tone==='critical'?'Critical | حرجة':'Warning | تحذير'}</em><b>›</b></div>)}</div>
    </div>
   </div>
  </div>

  {!!quick.length&&<div className="bafm-panel bafm-quick-panel"><div className="bafm-panel-head"><h2>Medical Quick Actions <span>| إجراءات طبية سريعة</span></h2></div><div className="bafm-quick-grid">
   {quick.map(([to,icon,en,ar])=><Link to={to} key={en} className="bafm-quick"><b>{icon}</b><strong>{en}</strong><span>{ar}</span></Link>)}
  </div></div>}
  <div className="bafm-dashboard-footer"><span>BAMM | Basmat Medical Equipment CMMS</span><span>People | Medical Equipment | Safety | Reliability · الأفراد | الأجهزة الطبية | السلامة | الاعتمادية</span></div>
 </section>
}
