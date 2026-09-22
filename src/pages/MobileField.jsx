import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMobileField,lookupAsset,fieldAction,uploadEvidence} from '../lib/mobileField'

export default function MobileField(){
 const {t}=useLanguage()
 const [data,setData]=useState({work_orders:[],summary:{},active_visit:null})
 const [assetCode,setAssetCode]=useState(''),[assetResult,setAssetResult]=useState(null)
 const [finish,setFinish]=useState(null),[labor,setLabor]=useState(null),[evidence,setEvidence]=useState(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadMobileField())}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const run=async(fn)=>{setBusy(true);setError('');try{await fn();await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const search=async e=>{e.preventDefault();setBusy(true);setError('');try{setAssetResult(await lookupAsset(assetCode))}catch(e){setError(e.message);setAssetResult(null)}finally{setBusy(false)}}
 const start=wo=>run(()=>fieldAction('start_visit',wo.id))
 const finishVisit=e=>{e.preventDefault();run(async()=>{await fieldAction('finish_visit',finish.wo.id,finish.visitId,{diagnosis:finish.diagnosis,work_performed:finish.work_performed,tests_performed:finish.tests_performed,notes:finish.notes});setFinish(null)})}
 const addLabor=e=>{e.preventDefault();run(async()=>{const end=new Date(),start=new Date(end.getTime()-Number(labor.minutes)*60000);await fieldAction('labor',labor.wo.id,labor.visitId,{started_at:start.toISOString(),ended_at:end.toISOString(),activity:labor.activity});setLabor(null)})}
 const addEvidence=e=>{e.preventDefault();run(async()=>{await uploadEvidence(evidence.wo.id,evidence.visitId,evidence.file,evidence.caption);setEvidence(null)})}
 const s=data.summary||{}
 return <section className="facility-module mobile-field">
  <div className="page-head"><h1>{t('mobileFieldTitle')}</h1><button className="btn secondary" onClick={load}>{t('mfRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="stats-grid facility-stats">{[['mfAssigned',s.assigned],['mfP1',s.p1],['mfBreached',s.sla_breached],['mfDueToday',s.due_today],['mfActiveVisit',s.active_visit]].map(([k,v])=><div className="stat-card" key={k}><span>{t(k)}</span><strong>{v??0}</strong></div>)}</div>
  <form className="facility-panel" onSubmit={search}><h2>{t('mfAssetLookup')}</h2><div className="form-grid"><label>{t('mfAssetCode')}<input value={assetCode} onChange={e=>setAssetCode(e.target.value)} required/></label></div><button className="btn primary">{t('mfLookup')}</button></form>
  {assetResult?.asset&&<div className="facility-panel"><h2>{assetResult.asset.asset_tag} — {assetResult.asset.name_ar||assetResult.asset.name_en}</h2><p>{assetResult.asset.client_name} · {assetResult.asset.site_name} · {assetResult.asset.condition} · {assetResult.asset.operational_status}</p></div>}
  <div className="facility-panel"><h2>{t('mfWorkOrders')}</h2>{!data.work_orders?.length?<p>{t('mfNoData')}</p>:<div className="mobile-card-list">{data.work_orders.map(wo=><article className="stat-card" key={wo.id}><strong>{wo.work_order_number} — {wo.title}</strong><p>{t('mfClient')}: {wo.client_name}<br/>{t('mfSite')}: {wo.site_name}<br/>{t('mfAsset')}: {wo.asset_tag||'—'}<br/>{t('mfPriority')}: {wo.priority} · {t('mfStatus')}: {wo.status} · {t('mfSla')}: {wo.sla_status}</p><div className="row-actions">{!wo.open_visit_id&&<button className="btn primary" disabled={busy} onClick={()=>start(wo)}>{t('mfStart')}</button>}{wo.open_visit_id&&<><button className="btn primary" onClick={()=>setFinish({wo,visitId:wo.open_visit_id,diagnosis:'',work_performed:'',tests_performed:'',notes:''})}>{t('mfFinish')}</button><button className="btn secondary" onClick={()=>setLabor({wo,visitId:wo.open_visit_id,activity:'',minutes:30})}>{t('mfLabor')}</button><button className="btn secondary" onClick={()=>setEvidence({wo,visitId:wo.open_visit_id,file:null,caption:''})}>{t('mfEvidence')}</button></>}</div></article>)}</div>}</div>
  {finish&&<form className="facility-panel" onSubmit={finishVisit}><h2>{t('mfFinish')}</h2><div className="form-grid"><label>{t('mfWorkPerformed')}<input required minLength={5} value={finish.work_performed} onChange={e=>setFinish(v=>({...v,work_performed:e.target.value}))}/></label><label>{t('mfDiagnosis')}<input value={finish.diagnosis} onChange={e=>setFinish(v=>({...v,diagnosis:e.target.value}))}/></label><label>{t('mfTests')}<input value={finish.tests_performed} onChange={e=>setFinish(v=>({...v,tests_performed:e.target.value}))}/></label><label>{t('mfNotes')}<input value={finish.notes} onChange={e=>setFinish(v=>({...v,notes:e.target.value}))}/></label></div><button className="btn primary">{t('mfFinish')}</button></form>}
  {labor&&<form className="facility-panel" onSubmit={addLabor}><h2>{t('mfLabor')}</h2><div className="form-grid"><label>{t('mfActivity')}<input required minLength={5} value={labor.activity} onChange={e=>setLabor(v=>({...v,activity:e.target.value}))}/></label><label>{t('mfMinutes')}<input type="number" min="1" max="1440" value={labor.minutes} onChange={e=>setLabor(v=>({...v,minutes:e.target.value}))}/></label></div><button className="btn primary">{t('mfLabor')}</button></form>}
  {evidence&&<form className="facility-panel" onSubmit={addEvidence}><h2>{t('mfEvidence')}</h2><div className="form-grid"><label>{t('mfEvidence')}<input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setEvidence(v=>({...v,file:e.target.files?.[0]||null}))}/></label><label>{t('mfCaption')}<input value={evidence.caption} onChange={e=>setEvidence(v=>({...v,caption:e.target.value}))}/></label></div><button className="btn primary" disabled={!evidence.file}>{t('mfUpload')}</button></form>}
 </section>
}
