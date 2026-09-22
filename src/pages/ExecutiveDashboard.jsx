import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadExecutiveDashboard} from '../lib/executive'

export default function ExecutiveDashboard(){
 const {t}=useLanguage()
 const [data,setData]=useState({operations:{},assets:{},commercial:{},risk:{},performance:{},top_risk_work_orders:[],expiring_contracts:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadExecutiveDashboard())}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const cards=(title,obj,items)=><div className="facility-panel"><h2>{t(title)}</h2><div className="stats-grid facility-stats">{items.map(([k,f])=><div className="stat-card" key={k}><span>{t(k)}</span><strong>{obj?.[f]??0}</strong></div>)}</div></div>
 return <section className="facility-module">
  <div className="page-head bafm-page-head">
   <div className="bafm-page-title">
    <img src="/bafm-logo.png" alt="BAFM" className="bafm-page-logo"/>
    <div><h1>{t('executiveDashboard')}</h1><p className="muted">BAFM · Basmat Alnawabigh Medical Equipment Maintenance Management System</p></div>
   </div>
   <button className="btn secondary" onClick={load} disabled={busy}>{t('executiveRefresh')}</button>
  </div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  {cards('executiveOperations',data.operations,[['exWoTotal','work_orders_total'],['exWoOpen','work_orders_open'],['exP1','p1_open'],['exSlaBreach','sla_breached'],['exPpmTotal','ppm_total'],['exPpmOverdue','ppm_overdue']])}
  {cards('executiveAssets',data.assets,[['exAssetsTotal','total'],['exCriticalAssets','critical'],['exPoorAssets','poor_failed'],['exOos','out_of_service']])}
  {cards('executiveCommercial',data.commercial,[['exContracts','contracts_total'],['exExpiring','contracts_expiring_60'],['exExpired','contracts_expired'],['exValue','contract_value_expiring_60'],['exCost','maintenance_cost']])}
  {cards('executiveRisk',data.risk,[['exHseOpen','hse_open'],['exHseCritical','hse_critical'],['exCompliance','compliance_overdue'],['exDowntime','open_downtime']])}
  {cards('executivePerformance',data.performance,[['exSupplier','supplier_avg_score'],['exReadings','utility_readings']])}
  <div className="facility-panel"><h2>{t('exRiskWo')}</h2>{!data.top_risk_work_orders?.length?<p>{t('exNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>#</th><th>{t('exClient')}</th><th>{t('exSite')}</th><th>{t('exPriority')}</th><th>{t('exStatus')}</th><th>{t('exSla')}</th><th>{t('exDue')}</th></tr></thead><tbody>{data.top_risk_work_orders.map(x=><tr key={x.id}><td>{x.work_order_number}</td><td>{x.client_name}</td><td>{x.site_name}</td><td>{x.priority}</td><td>{x.status}</td><td>{x.sla_status}</td><td>{x.completion_due_at||'—'}</td></tr>)}</tbody></table></div>}</div>
  <div className="facility-panel"><h2>{t('exExpiringList')}</h2>{!data.expiring_contracts?.length?<p>{t('exNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('exContract')}</th><th>{t('exClient')}</th><th>{t('exEnd')}</th><th>{t('exDays')}</th></tr></thead><tbody>{data.expiring_contracts.map(x=><tr key={x.id}><td>{x.contract_number}</td><td>{x.client_name}</td><td>{x.end_date}</td><td>{x.days_remaining}</td></tr>)}</tbody></table></div>}</div>
 </section>
}
