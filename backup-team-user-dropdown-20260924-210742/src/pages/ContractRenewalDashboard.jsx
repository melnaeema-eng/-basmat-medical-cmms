import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadContractRenewal,updateContractRenewal} from '../lib/contractRenewal'

export default function ContractRenewalDashboard(){
 const {t}=useLanguage()
 const [horizon,setHorizon]=useState(120)
 const [data,setData]=useState({contracts:[],summary:{}})
 const [edit,setEdit]=useState(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')

 const load=async()=>{
  setBusy(true);setError('')
  try{setData(await loadContractRenewal({horizon_days:horizon}))}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const openEdit=x=>setEdit({
  contract_id:x.id,
  renewal_status:x.renewal_status||'not_started',
  target_date:x.renewal_target_date||'',
  note:x.renewal_note||''
 })

 const save=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{await updateContractRenewal(edit);setEdit(null);await load()}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const renewalLabel=x=>({
  not_started:t('renewalNotStarted'),contacted:t('renewalContacted'),negotiating:t('renewalNegotiating'),
  approved:t('renewalApproved'),renewed:t('renewalRenewed'),not_renewing:t('renewalNotRenewing')
 }[x]||x)

 const s=data.summary||{}

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('contractRenewalCenter')}</h1></div>
   <button className="btn secondary" onClick={load} disabled={busy}>{t('contractRenewalRefresh')}</button>
  </div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="facility-panel">
   <div className="form-grid">
    <label>{t('contractRenewalHorizon')}<input type="number" min="1" max="730" value={horizon} onChange={e=>setHorizon(e.target.value)}/></label>
   </div>
   <button className="btn primary" onClick={load} disabled={busy}>{t('contractRenewalRefresh')}</button>
  </div>

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('contractRenewalTotal')}</span><strong>{s.total||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewalExpired')}</span><strong>{s.expired||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewal30')}</span><strong>{s.next_30_days||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewal60')}</span><strong>{s.next_60_days||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewalProgress')}</span><strong>{s.renewal_in_progress||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewalBreaches')}</span><strong>{s.sla_breaches||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewalOpenWO')}</span><strong>{s.open_work_orders||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewalSla')}</span><strong>{s.avg_sla_compliance||0}</strong></div>
   <div className="stat-card"><span>{t('contractRenewalValueRisk')}</span><strong>{s.contract_value_at_risk||0}</strong></div>
  </div>

  {edit&&<form className="facility-panel" onSubmit={save}>
   <h2>{t('contractRenewalEdit')}</h2>
   <div className="form-grid">
    <label>{t('contractRenewalStatus')}<select value={edit.renewal_status} onChange={e=>setEdit(v=>({...v,renewal_status:e.target.value}))}>
     {['not_started','contacted','negotiating','approved','renewed','not_renewing'].map(x=><option key={x} value={x}>{renewalLabel(x)}</option>)}
    </select></label>
    <label>{t('contractRenewalTarget')}<input type="date" value={edit.target_date} onChange={e=>setEdit(v=>({...v,target_date:e.target.value}))}/></label>
    <label>{t('contractRenewalNote')}<input value={edit.note} onChange={e=>setEdit(v=>({...v,note:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy}>{t('contractRenewalSave')}</button>
  </form>}

  <div className="facility-panel">
   {!data.contracts?.length?<p>{t('contractRenewalNone')}</p>:<div className="table-wrap"><table>
    <thead><tr>
     <th>{t('contractRenewalNumber')}</th><th>{t('contractRenewalClient')}</th><th>{t('contractRenewalType')}</th>
     <th>{t('contractRenewalEnd')}</th><th>{t('contractRenewalDays')}</th><th>{t('contractRenewalValue')}</th>
     <th>{t('contractRenewalWorkOrders')}</th><th>{t('contractRenewalBreach')}</th><th>{t('contractRenewalCompliance')}</th>
     <th>{t('contractRenewalStatus')}</th><th></th>
    </tr></thead>
    <tbody>{data.contracts.map(x=><tr key={x.id}>
     <td>{x.contract_number}</td><td>{x.client_name}</td><td>{x.contract_type||'—'}</td>
     <td>{x.end_date||'—'}</td><td>{x.days_to_expiry??'—'}</td><td>{x.contract_value??0}</td>
     <td>{x.work_orders}</td><td>{x.sla_breached}</td><td>{x.sla_compliance_pct}</td>
     <td>{renewalLabel(x.renewal_status)}</td>
     <td><button className="btn xs secondary" onClick={()=>openEdit(x)}>{t('contractRenewalEdit')}</button></td>
    </tr>)}</tbody>
   </table></div>}
  </div>
 </section>
}
