import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadPlanning} from '../lib/planning'

const iso=d=>d.toISOString().slice(0,10)

export default function PlanningCalendar(){
 const {t,lang}=useLanguage()
 const today=new Date(),end=new Date(Date.now()+30*86400000)
 const [from,setFrom]=useState(iso(today)),[to,setTo]=useState(iso(end)),[source,setSource]=useState('')
 const [data,setData]=useState({items:[],summary:{},truncated:false}),[busy,setBusy]=useState(false),[error,setError]=useState('')

 const load=async()=>{
  setBusy(true);setError('')
  try{setData(await loadPlanning({from,to,source}))}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const sourceLabel=s=>({
  work_order:t('planningWorkOrder'),ppm:t('planningPpm'),warranty:t('planningWarranty'),
  inspection:t('planningInspection'),replacement:t('planningReplacement')
 }[s]||s)

 const timingLabel=x=>({
  overdue:t('planningOverdue'),today:t('planningToday'),
  next_7_days:t('planningNext7'),future:t('planningFuture')
 }[x]||x)

 const linkFor=x=>{
  if(x.source==='work_order') return '/corrective/work_order/'+x.entity_id
  if(x.source==='ppm') return '/ppm/job/'+x.entity_id
  if(['warranty','inspection','replacement'].includes(x.source)) return '/assets/'+x.entity_id
  return null
 }

 const s=data.summary||{}

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('planningCenter')}</h1></div>
   <button className="btn secondary" onClick={load} disabled={busy}>{t('planningRefresh')}</button>
  </div>

  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="facility-panel">
   <div className="form-grid">
    <label>{t('planningSource')}<select value={source} onChange={e=>setSource(e.target.value)}>
     <option value="">{t('planningAll')}</option>
     <option value="work_order">{t('planningWorkOrder')}</option>
     <option value="ppm">{t('planningPpm')}</option>
     <option value="warranty">{t('planningWarranty')}</option>
     <option value="inspection">{t('planningInspection')}</option>
     <option value="replacement">{t('planningReplacement')}</option>
    </select></label>
    <label>{t('planningFrom')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>{t('planningTo')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   </div>
   <button className="btn primary" onClick={load} disabled={busy}>{t('planningApply')}</button>
  </div>

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('planningTotal')}</span><strong>{s.total||0}</strong></div>
   <div className="stat-card"><span>{t('planningOverdue')}</span><strong>{s.overdue||0}</strong></div>
   <div className="stat-card"><span>{t('planningToday')}</span><strong>{s.today||0}</strong></div>
   <div className="stat-card"><span>{t('planningNext7')}</span><strong>{s.next_7_days||0}</strong></div>
   <div className="stat-card"><span>{t('planningWorkOrder')}</span><strong>{s.work_orders||0}</strong></div>
   <div className="stat-card"><span>{t('planningPpm')}</span><strong>{s.ppm||0}</strong></div>
  </div>

  <div className="facility-panel">
   {data.truncated&&<p className="muted">{t('planningTruncated')}</p>}
   {!data.items?.length?<p>{t('planningNoData')}</p>:
   <div className="table-wrap"><table>
    <thead><tr><th>{t('planningDate')}</th><th>{t('planningSource')}</th><th>{t('planningReference')}</th><th>{t('planningTitle')}</th><th>{t('planningPriority')}</th><th>{t('planningStatus')}</th><th>{t('planningTiming')}</th><th></th></tr></thead>
    <tbody>{data.items.map((x,i)=>{
      const href=linkFor(x)
      return <tr key={x.source+'-'+x.entity_id+'-'+x.event_date+'-'+i}>
       <td>{new Intl.DateTimeFormat(lang==='ar'?'ar-SA':'en-GB').format(new Date(x.event_date+'T00:00:00'))}</td>
       <td>{sourceLabel(x.source)}</td><td>{x.reference}</td><td>{x.title}</td>
       <td>{x.priority}</td><td>{x.status}</td><td>{timingLabel(x.timing)}</td>
       <td>{href&&<Link to={href}>{t('planningOpen')}</Link>}</td>
      </tr>
    })}</tbody>
   </table></div>}
  </div>
 </section>
}
