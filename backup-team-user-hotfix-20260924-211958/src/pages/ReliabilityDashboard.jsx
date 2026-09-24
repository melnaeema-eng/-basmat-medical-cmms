import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadReliability,openDowntime,closeDowntime,cancelDowntime} from '../lib/reliability'

const iso=d=>d.toISOString().slice(0,10)
const localNow=()=>{
 const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000)
 return d.toISOString().slice(0,16)
}

export default function ReliabilityDashboard(){
 const {t}=useLanguage()
 const today=new Date(),start=new Date(Date.now()-90*86400000)
 const [from,setFrom]=useState(iso(start)),[to,setTo]=useState(iso(today))
 const [data,setData]=useState({assets:[],open_incidents:[],recent_incidents:[],summary:{}})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [form,setForm]=useState({asset_id:'',incident_type:'failure',started_at:localNow(),reason:'',work_order_id:''})

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const x=await loadReliability({from,to})
   setData(x)
   if(!form.asset_id&&x.assets?.[0])setForm(v=>({...v,asset_id:x.assets[0].asset_id}))
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const save=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await openDowntime(form)
   setForm(v=>({...v,reason:'',work_order_id:'',started_at:localNow()}))
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const closeIncident=async x=>{
  const resolution=prompt(t('reliabilityResolution'))
  if(!resolution)return
  try{setBusy(true);await closeDowntime(x.id,localNow(),resolution);await load()}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const cancelIncident=async x=>{
  const reason=prompt(t('reliabilityReason'))
  if(!reason)return
  try{setBusy(true);await cancelDowntime(x.id,reason);await load()}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const typeLabel=x=>({
  failure:t('reliabilityFailure'),
  planned_maintenance:t('reliabilityPlanned'),
  utility:t('reliabilityUtility'),
  external:t('reliabilityExternal'),
  other:t('reliabilityOther')
 }[x]||x)

 const s=data.summary||{}

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('reliabilityCenter')}</h1></div>
   <button className="btn secondary" onClick={load} disabled={busy}>{t('reliabilityRefresh')}</button>
  </div>

  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="facility-panel">
   <div className="form-grid">
    <label>{t('reliabilityFrom')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>{t('reliabilityTo')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   </div>
   <button className="btn primary" onClick={load} disabled={busy}>{t('reliabilityApply')}</button>
  </div>

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('reliabilityAssets')}</span><strong>{s.assets||0}</strong></div>
   <div className="stat-card"><span>{t('reliabilityIncidents')}</span><strong>{s.incidents||0}</strong></div>
   <div className="stat-card"><span>{t('reliabilityFailures')}</span><strong>{s.failures||0}</strong></div>
   <div className="stat-card"><span>{t('reliabilityOpen')}</span><strong>{s.open_incidents||0}</strong></div>
   <div className="stat-card"><span>{t('reliabilityDowntime')}</span><strong>{s.downtime_hours||0}</strong></div>
   <div className="stat-card"><span>{t('reliabilityAvailability')}</span><strong>{s.avg_availability??100}</strong></div>
   <div className="stat-card"><span>{t('reliabilityMTTR')}</span><strong>{s.avg_mttr_hours||0}</strong></div>
   <div className="stat-card"><span>{t('reliabilityMTBF')}</span><strong>{s.avg_mtbf_hours||0}</strong></div>
  </div>

  <form className="facility-panel" onSubmit={save}>
   <h2>{t('reliabilityOpenIncident')}</h2>
   <div className="form-grid">
    <label>{t('reliabilityAsset')}<select required value={form.asset_id} onChange={e=>setForm(v=>({...v,asset_id:e.target.value}))}>
     <option value="">—</option>{data.assets?.map(a=><option key={a.asset_id} value={a.asset_id}>{a.asset_tag} — {a.asset_name}</option>)}
    </select></label>
    <label>{t('reliabilityType')}<select value={form.incident_type} onChange={e=>setForm(v=>({...v,incident_type:e.target.value}))}>
     <option value="failure">{t('reliabilityFailure')}</option><option value="planned_maintenance">{t('reliabilityPlanned')}</option>
     <option value="utility">{t('reliabilityUtility')}</option><option value="external">{t('reliabilityExternal')}</option><option value="other">{t('reliabilityOther')}</option>
    </select></label>
    <label>{t('reliabilityStart')}<input required type="datetime-local" value={form.started_at} onChange={e=>setForm(v=>({...v,started_at:e.target.value}))}/></label>
    <label>{t('reliabilityReason')}<input required minLength={5} value={form.reason} onChange={e=>setForm(v=>({...v,reason:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy||!form.asset_id}>{t('reliabilityOpenIncident')}</button>
  </form>

  <div className="facility-panel">
   <h2>{t('reliabilityOpen')}</h2>
   {!data.open_incidents?.length?<p>{t('reliabilityNoData')}</p>:
   <div className="table-wrap"><table><thead><tr><th>{t('reliabilityAsset')}</th><th>{t('reliabilityType')}</th><th>{t('reliabilityStart')}</th><th>{t('reliabilityReason')}</th><th></th></tr></thead>
   <tbody>{data.open_incidents.map(x=><tr key={x.id}><td><Link to={'/assets/'+x.asset_id}>{x.asset_tag} — {x.asset_name}</Link></td><td>{typeLabel(x.incident_type)}</td><td>{new Date(x.started_at).toLocaleString()}</td><td>{x.reason}</td><td><button className="btn xs primary" onClick={()=>closeIncident(x)}>{t('reliabilityClose')}</button><button className="btn xs danger-soft" onClick={()=>cancelIncident(x)}>{t('reliabilityCancel')}</button></td></tr>)}</tbody></table></div>}
  </div>

  <div className="facility-panel">
   <h2>{t('reliabilityAssets')}</h2>
   {!data.assets?.length?<p>{t('reliabilityNoData')}</p>:
   <div className="table-wrap"><table><thead><tr><th>{t('reliabilityAsset')}</th><th>{t('reliabilityIncidents')}</th><th>{t('reliabilityFailures')}</th><th>{t('reliabilityDowntime')}</th><th>{t('reliabilityAvailability')}</th><th>{t('reliabilityMTTR')}</th><th>{t('reliabilityMTBF')}</th></tr></thead>
   <tbody>{data.assets.map(x=><tr key={x.asset_id}><td><Link to={'/assets/'+x.asset_id}>{x.asset_tag} — {x.asset_name}</Link></td><td>{x.incident_count}</td><td>{x.failure_count}</td><td>{x.downtime_hours}</td><td><strong>{x.availability_pct}</strong></td><td>{x.mttr_hours}</td><td>{x.mtbf_hours}</td></tr>)}</tbody></table></div>}
  </div>

  <div className="facility-panel">
   <h2>{t('reliabilityRecent')}</h2>
   {!data.recent_incidents?.length?<p>{t('reliabilityNoData')}</p>:
    <div className="event-list">{data.recent_incidents.map(x=><div className="event-item" key={x.id}><strong>{x.asset_tag} — {typeLabel(x.incident_type)} — {x.duration_hours}h</strong><span>{x.status} · {x.reason}</span></div>)}</div>}
  </div>
 </section>
}
