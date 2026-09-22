import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadLifecycle,inspectAsset,createClaim,updateClaim,savePlan} from '../lib/lifecycle'
export default function AssetLifecycle(){
 const {t,lang}=useLanguage(),[data,setData]=useState({assets:[],inspections:[],claims:[],plans:[]}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[assetId,setAssetId]=useState('')
 const [inspection,setInspection]=useState({condition:'good',operational_status:'in_service',score:'',notes:'',next_inspection_date:''})
 const [claim,setClaim]=useState({claim_number:'',provider:'',issue:''})
 const [plan,setPlan]=useState({target_date:'',priority:'medium',reason:'',estimated_cost:'',currency:'SAR',status:'planned'})
 const load=async()=>{setBusy(true);setError('');try{const x=await loadLifecycle();setData(x);if(!assetId&&x.assets?.[0])setAssetId(x.assets[0].id)}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const asset=data.assets?.find(a=>a.id===assetId)
 const submitInspection=async e=>{e.preventDefault();try{setBusy(true);await inspectAsset({...inspection,asset_id:assetId});await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const submitClaim=async e=>{e.preventDefault();try{setBusy(true);await createClaim({...claim,asset_id:assetId});setClaim({claim_number:'',provider:'',issue:''});await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const submitPlan=async e=>{e.preventDefault();try{setBusy(true);await savePlan({...plan,asset_id:assetId});await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('lifecycleCenter')}</h1></div><button className="btn secondary" onClick={load} disabled={busy}>{t('lifecycleRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="facility-panel"><label>{t('lifecycleAsset')}<select value={assetId} onChange={e=>setAssetId(e.target.value)}>{data.assets?.map(a=><option key={a.id} value={a.id}>{a.asset_tag} — {lang==='ar'?a.name_ar:a.name_en}</option>)}</select></label>
   {asset&&<div className="stats-grid facility-stats"><div className="stat-card"><span>{t('condition')}</span><strong>{t(asset.condition)}</strong></div><div className="stat-card"><span>{t('lifecycleWarrantyDays')}</span><strong>{asset.warranty_days??'—'}</strong></div><div className="stat-card"><span>{t('lifecycleExpectedReplacement')}</span><strong>{asset.expected_replacement_date||'—'}</strong></div></div>}
  </div>
  <form className="facility-panel" onSubmit={submitInspection}><h2>{t('lifecycleInspect')}</h2><div className="form-grid">
   <label>{t('condition')}<select value={inspection.condition} onChange={e=>setInspection(v=>({...v,condition:e.target.value}))}>{['excellent','good','fair','poor','failed'].map(x=><option key={x} value={x}>{t(x)}</option>)}</select></label>
   <label>{t('operationalStatus')}<select value={inspection.operational_status} onChange={e=>setInspection(v=>({...v,operational_status:e.target.value}))}>{['in_service','out_of_service','under_maintenance','disposed'].map(x=><option key={x} value={x}>{t(x)}</option>)}</select></label>
   <label>{t('lifecycleScore')}<input type="number" min="0" max="100" value={inspection.score} onChange={e=>setInspection(v=>({...v,score:e.target.value}))}/></label>
   <label>{t('lifecycleNext')}<input type="date" value={inspection.next_inspection_date} onChange={e=>setInspection(v=>({...v,next_inspection_date:e.target.value}))}/></label>
   <label>{t('lifecycleNotes')}<textarea value={inspection.notes} onChange={e=>setInspection(v=>({...v,notes:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy||!assetId}>{t('lifecycleSaveInspection')}</button></form>
  <form className="facility-panel" onSubmit={submitClaim}><h2>{t('lifecycleWarranty')}</h2><div className="form-grid">
   <label>{t('lifecycleClaimNo')}<input required value={claim.claim_number} onChange={e=>setClaim(v=>({...v,claim_number:e.target.value}))}/></label>
   <label>{t('lifecycleProvider')}<input value={claim.provider} onChange={e=>setClaim(v=>({...v,provider:e.target.value}))}/></label>
   <label>{t('lifecycleIssue')}<textarea required minLength={5} value={claim.issue} onChange={e=>setClaim(v=>({...v,issue:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy||!assetId}>{t('lifecycleCreateClaim')}</button></form>
  <form className="facility-panel" onSubmit={submitPlan}><h2>{t('lifecycleReplacement')}</h2><div className="form-grid">
   <label>{t('lifecyclePlanDate')}<input type="date" value={plan.target_date} onChange={e=>setPlan(v=>({...v,target_date:e.target.value}))}/></label>
   <label>{t('lifecyclePriority')}<select value={plan.priority} onChange={e=>setPlan(v=>({...v,priority:e.target.value}))}>{['low','medium','high','critical'].map(x=><option key={x} value={x}>{t(x)}</option>)}</select></label>
   <label>{t('lifecycleCost')}<input type="number" min="0" step="0.01" value={plan.estimated_cost} onChange={e=>setPlan(v=>({...v,estimated_cost:e.target.value}))}/></label>
   <label>{t('lifecycleCurrency')}<input maxLength={3} value={plan.currency} onChange={e=>setPlan(v=>({...v,currency:e.target.value.toUpperCase()}))}/></label>
   <label>{t('lifecyclePlanStatus')}<select value={plan.status} onChange={e=>setPlan(v=>({...v,status:e.target.value}))}>{['planned','budgeted','approved','completed','cancelled'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
   <label>{t('lifecycleReason')}<textarea value={plan.reason} onChange={e=>setPlan(v=>({...v,reason:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy||!assetId}>{t('lifecycleSavePlan')}</button></form>
  <div className="facility-panel"><h2>{t('lifecycleWarranty')}</h2>{data.claims?.length?data.claims.map(c=><div className="event-item" key={c.id}><strong>{c.claim_number} — {c.status}</strong><span>{c.issue}</span></div>):<p>{t('lifecycleNoData')}</p>}</div>
 </section>
}
