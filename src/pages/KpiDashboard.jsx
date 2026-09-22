import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadKpi} from '../lib/kpi'

const iso=d=>d.toISOString().slice(0,10)

export default function KpiDashboard(){
 const {t}=useLanguage()
 const today=new Date(),start=new Date(today.getTime()-30*86400000)
 const [from,setFrom]=useState(iso(start)),[to,setTo]=useState(iso(today))
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')

 const load=async()=>{
  setBusy(true);setError('')
  try{setData(await loadKpi({from,to}))}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const card=(label,value)=><div className="stat-card"><span>{label}</span><strong>{value??0}</strong></div>
 const wo=data?.work_orders||{},ppm=data?.ppm||{},assets=data?.assets||{}

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('kpiDashboard')}</h1><p className="muted">{t('kpiPeriod')}: {from} → {to}</p></div>
   <button className="btn secondary" disabled={busy} onClick={load}>{t('kpiRefresh')}</button>
  </div>

  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="facility-panel">
   <div className="form-grid">
    <label>{t('kpiFrom')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>{t('kpiTo')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   </div>
   <button className="btn primary" disabled={busy} onClick={load}>{t('kpiApply')}</button>
  </div>

  <div className="facility-panel">
   <h2>{t('kpiWorkOrders')}</h2>
   <div className="stats-grid facility-stats">
    {card(t('kpiWorkOrders'),wo.total)}
    {card(t('kpiOpen'),wo.open)}
    {card(t('kpiClosed'),wo.closed)}
    {card(t('kpiSlaBreached'),wo.sla_breached)}
    {card(t('kpiSlaMet'),wo.sla_met)}
    {card(t('kpiP1Open'),wo.p1_open)}
    {card(t('kpiAvgClose'),wo.avg_close_hours)}
   </div>
  </div>

  <div className="facility-panel">
   <h2>{t('kpiPpm')}</h2>
   <div className="stats-grid facility-stats">
    {card(t('kpiPpm'),ppm.total)}
    {card(t('kpiCompleted'),ppm.completed)}
    {card(t('kpiOverdue'),ppm.overdue)}
    {card(t('kpiCompliance'),ppm.compliance_pct)}
   </div>
  </div>

  <div className="facility-panel">
   <h2>{t('kpiAssets')}</h2>
   <div className="stats-grid facility-stats">
    {card(t('kpiAssets'),assets.total)}
    {card(t('kpiCritical'),assets.critical)}
    {card(t('kpiPoorFailed'),assets.poor_or_failed)}
    {card(t('kpiOutOfService'),assets.out_of_service)}
   </div>
  </div>

  <div className="facility-panel">
   <h2>{t('kpiSlaList')}</h2>
   {!data?.sla_breaches?.length?<p>{t('kpiNoData')}</p>:
    <div className="event-list">{data.sla_breaches.map(x=>
     <div className="event-item" key={x.id}>
      <Link to={'/corrective/work_order/'+x.id}><strong>{x.work_order_number} — {x.title}</strong></Link>
      <span>{x.priority} · {x.status}</span>
     </div>)}</div>}
  </div>

  <div className="facility-panel">
   <h2>{t('kpiPpmList')}</h2>
   {!data?.overdue_ppm?.length?<p>{t('kpiNoData')}</p>:
    <div className="event-list">{data.overdue_ppm.map(x=>
     <div className="event-item" key={x.id}>
      <Link to={'/ppm/job/'+x.id}><strong>{x.job_number}</strong></Link>
      <span>{x.due_date} · {x.status}</span>
     </div>)}</div>}
  </div>
 </section>
}
