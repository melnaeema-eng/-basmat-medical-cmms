import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadAudit} from '../lib/audit'
const iso=d=>d.toISOString().slice(0,10)
export default function AuditCenter(){
 const {t,lang}=useLanguage(),today=new Date(),start=new Date(Date.now()-30*86400000)
 const [from,setFrom]=useState(iso(start)),[to,setTo]=useState(iso(today)),[source,setSource]=useState('')
 const [data,setData]=useState({items:[],total:0,has_more:false}),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadAudit({from,to,source}))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const sourceLabel=s=>t('audit'+s[0].toUpperCase()+s.slice(1))
 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('auditCenter')}</h1><p className="muted">{t('auditTotal')}: {data.total||0}</p></div><button className="btn secondary" onClick={load} disabled={busy}>{t('auditRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="facility-panel"><div className="form-grid">
   <label>{t('auditSource')}<select value={source} onChange={e=>setSource(e.target.value)}><option value="">{t('auditAll')}</option>{['corrective','ppm','field','inventory','approvals','assets'].map(x=><option key={x} value={x}>{sourceLabel(x)}</option>)}</select></label>
   <label>{t('auditFrom')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label>{t('auditTo')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
  </div><button className="btn primary" onClick={load} disabled={busy}>{t('auditApply')}</button></div>
  <div className="facility-panel">{!data.items?.length?<p>{t('auditNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('auditTime')}</th><th>{t('auditSource')}</th><th>{t('auditActor')}</th><th>{t('auditAction')}</th><th>{t('auditEntity')}</th><th>{t('auditDetails')}</th></tr></thead><tbody>{data.items.map(x=><tr key={x.source+'-'+x.event_id}><td>{new Date(x.created_at).toLocaleString(lang==='ar'?'ar-SA':'en-GB')}</td><td>{sourceLabel(x.source)}</td><td>{x.full_name||x.email||x.actor_id||'System'}</td><td>{x.action}</td><td>{x.entity_type}<br/><small>{x.entity_id}</small></td><td><code>{JSON.stringify(x.details||{})}</code></td></tr>)}</tbody></table></div>}</div>
 </section>
}
