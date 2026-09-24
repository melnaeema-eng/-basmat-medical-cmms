import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadGovernance,repairGovernanceViews} from '../lib/governance'

export default function GovernanceMatrix(){
 const {t}=useLanguage()
 const [data,setData]=useState({roles:[],permission_anomalies:[],scope_anomalies:[],summary:{}})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadGovernance())}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const repair=async()=>{setBusy(true);setError('');try{await repairGovernanceViews();await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const s=data.summary||{}
 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('governanceTitle')}</h1><p className="muted">Owner → Contractor → Project → Supervisor → Technician / Worker</p></div><div className="form-actions"><button className="btn secondary" onClick={load}>{t('govRefresh')}</button><button className="btn primary" onClick={repair}>{t('govRepair')}</button></div></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="security-mini-grid">
   <div><span>{t('govRoles')}</span><strong>{s.roles||0}</strong></div>
   <div><span>{t('govPermissions')}</span><strong>{s.permissions||0}</strong></div>
   <div><span>{t('govAssignments')}</span><strong>{s.active_scoped_assignments||0}</strong></div>
   <div><span>{t('govPermissionIssues')}</span><strong>{s.permission_anomalies||0}</strong></div>
   <div><span>{t('govScopeIssues')}</span><strong>{s.scope_anomalies||0}</strong></div>
  </div>

  <div className="facility-panel"><h2>{t('govRoles')}</h2><div className="table-wrap"><table><thead><tr><th>{t('govLevel')}</th><th>{t('govRole')}</th><th>{t('govDomain')}</th><th>{t('govRecommendedScope')}</th><th>{t('govPermissions')}</th></tr></thead><tbody>{(data.roles||[]).map(r=><tr key={r.role_id}><td>{r.level_no??'—'}</td><td><strong>{r.role_name}</strong><br/><small>{r.role_code}</small></td><td>{r.domain||'—'}</td><td>{r.recommended_scope||'—'}</td><td><details><summary>{r.permissions?.length||0}</summary><div className="security-detail-list">{(r.permissions||[]).map(p=><div key={p}>{p}</div>)}</div></details></td></tr>)}</tbody></table></div></div>

  <div className="facility-panel"><h2>{t('govPermissionIssues')}</h2>{!(data.permission_anomalies||[]).length?<p>{t('govNoIssues')}</p>:<div className="security-check-list">{data.permission_anomalies.map((x,i)=><article className="security-check-card" key={i}><div><strong>{x.role_code}</strong><p>{x.permission_code}</p></div><span className="security-pill">{t('govMissingView')}: {x.missing_view_permission}</span></article>)}</div>}</div>

  <div className="facility-panel"><h2>{t('govScopeIssues')}</h2>{!(data.scope_anomalies||[]).length?<p>{t('govNoIssues')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('govRole')}</th><th>User</th><th>{t('govActualScope')}</th><th>{t('govRecommendedScope')}</th></tr></thead><tbody>{data.scope_anomalies.map(x=><tr key={x.scope_id}><td>{x.role_code}</td><td>{x.user_id}</td><td>{x.scope_level}</td><td>{x.recommended_scope}</td></tr>)}</tbody></table></div>}</div>
 </section>
}
