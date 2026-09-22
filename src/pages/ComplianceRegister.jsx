import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadCompliance,createComplianceObligation,recordComplianceResult,archiveComplianceObligation} from '../lib/compliance'

const today=()=>new Date().toISOString().slice(0,10)
const localNow=()=>{
 const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000)
 return d.toISOString().slice(0,16)
}

export default function ComplianceRegister(){
 const {t}=useLanguage()
 const [data,setData]=useState({obligations:[],sites:[],assets:[],summary:{},recent_results:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [form,setForm]=useState({scope_type:'site',site_id:'',asset_id:'',title:'',authority:'',category:'safety',severity:'high',frequency_months:'12',next_due_date:today(),notes:''})
 const [result,setResult]=useState({obligation_id:'',result:'pass',completed_at:localNow(),certificate_number:'',evidence_reference:'',valid_until:'',notes:''})

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const x=await loadCompliance()
   setData(x)
   if(!form.site_id&&x.sites?.[0])setForm(v=>({...v,site_id:x.sites[0].id}))
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const availableAssets=(data.assets||[]).filter(a=>a.site_id===form.site_id)

 const saveObligation=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await createComplianceObligation(form)
   setForm(v=>({...v,title:'',authority:'',notes:'',asset_id:''}))
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const saveResult=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await recordComplianceResult(result)
   setResult({obligation_id:'',result:'pass',completed_at:localNow(),certificate_number:'',evidence_reference:'',valid_until:'',notes:''})
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const archive=async o=>{
  const reason=prompt(t('complianceArchive'))
  if(!reason)return
  try{setBusy(true);await archiveComplianceObligation(o.id,reason);await load()}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const s=data.summary||{}
 const categoryLabel=x=>({
  safety:t('complianceSafety'),fire:t('complianceFire'),electrical:t('complianceElectrical'),
  mechanical:t('complianceMechanical'),environmental:t('complianceEnvironmental'),
  civil:t('complianceCivil'),other:t('complianceOther')
 }[x]||x)

 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('complianceCenter')}</h1></div><button className="btn secondary" onClick={load} disabled={busy}>{t('complianceRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('complianceTotal')}</span><strong>{s.total||0}</strong></div>
   <div className="stat-card"><span>{t('complianceOverdue')}</span><strong>{s.overdue||0}</strong></div>
   <div className="stat-card"><span>{t('complianceToday')}</span><strong>{s.due_today||0}</strong></div>
   <div className="stat-card"><span>{t('compliance30')}</span><strong>{s.due_30||0}</strong></div>
   <div className="stat-card"><span>{t('complianceCritical')}</span><strong>{s.critical||0}</strong></div>
   <div className="stat-card"><span>{t('complianceFailed')}</span><strong>{s.failed||0}</strong></div>
  </div>

  <form className="facility-panel" onSubmit={saveObligation}>
   <h2>{t('complianceAdd')}</h2>
   <div className="form-grid">
    <label>{t('complianceScope')}<select value={form.scope_type} onChange={e=>setForm(v=>({...v,scope_type:e.target.value,asset_id:''}))}><option value="site">{t('complianceSite')}</option><option value="asset">{t('complianceAsset')}</option></select></label>
    <label>{t('complianceSite')}<select required value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value,asset_id:''}))}><option value="">—</option>{data.sites?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    {form.scope_type==='asset'&&<label>{t('complianceAsset')}<select required value={form.asset_id} onChange={e=>setForm(v=>({...v,asset_id:e.target.value}))}><option value="">—</option>{availableAssets.map(x=><option key={x.id} value={x.id}>{x.asset_tag} — {x.name}</option>)}</select></label>}
    <label>{t('complianceTitle')}<input required minLength={3} value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
    <label>{t('complianceAuthority')}<input value={form.authority} onChange={e=>setForm(v=>({...v,authority:e.target.value}))}/></label>
    <label>{t('complianceCategory')}<select value={form.category} onChange={e=>setForm(v=>({...v,category:e.target.value}))}>{['safety','fire','electrical','mechanical','environmental','civil','other'].map(x=><option key={x} value={x}>{categoryLabel(x)}</option>)}</select></label>
    <label>{t('complianceSeverity')}<select value={form.severity} onChange={e=>setForm(v=>({...v,severity:e.target.value}))}>{['low','medium','high','critical'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>{t('complianceFrequency')}<input type="number" min="1" max="120" value={form.frequency_months} onChange={e=>setForm(v=>({...v,frequency_months:e.target.value}))}/></label>
    <label>{t('complianceDue')}<input required type="date" value={form.next_due_date} onChange={e=>setForm(v=>({...v,next_due_date:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy}>{t('complianceSave')}</button>
  </form>

  {result.obligation_id&&<form className="facility-panel" onSubmit={saveResult}>
   <h2>{t('complianceResult')}</h2>
   <div className="form-grid">
    <label>{t('complianceResult')}<select value={result.result} onChange={e=>setResult(v=>({...v,result:e.target.value}))}><option value="pass">{t('compliancePass')}</option><option value="conditional">{t('complianceConditional')}</option><option value="fail">{t('complianceFail')}</option></select></label>
    <label>{t('complianceCompleted')}<input required type="datetime-local" value={result.completed_at} onChange={e=>setResult(v=>({...v,completed_at:e.target.value}))}/></label>
    <label>{t('complianceCertificate')}<input value={result.certificate_number} onChange={e=>setResult(v=>({...v,certificate_number:e.target.value}))}/></label>
    <label>{t('complianceEvidence')}<input value={result.evidence_reference} onChange={e=>setResult(v=>({...v,evidence_reference:e.target.value}))}/></label>
    <label>{t('complianceValidUntil')}<input type="date" value={result.valid_until} onChange={e=>setResult(v=>({...v,valid_until:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy}>{t('complianceResult')}</button>
  </form>}

  <div className="facility-panel">
   {!data.obligations?.length?<p>{t('complianceNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('complianceTitle')}</th><th>{t('complianceSite')}</th><th>{t('complianceAsset')}</th><th>{t('complianceCategory')}</th><th>{t('complianceSeverity')}</th><th>{t('complianceDue')}</th><th>{t('complianceResult')}</th><th></th></tr></thead>
   <tbody>{data.obligations.map(o=><tr key={o.id}><td>{o.title}<br/><small>{o.authority}</small></td><td>{o.site_name}</td><td>{o.asset_tag||'—'} {o.asset_name||''}</td><td>{categoryLabel(o.category)}</td><td>{o.severity}</td><td>{o.next_due_date} · {o.due_state}</td><td>{o.last_result||'—'}</td><td><button className="btn xs primary" onClick={()=>setResult(v=>({...v,obligation_id:o.id}))}>{t('complianceResult')}</button><button className="btn xs danger-soft" onClick={()=>archive(o)}>{t('complianceArchive')}</button></td></tr>)}</tbody></table></div>}
  </div>

  <div className="facility-panel">
   <h2>{t('complianceRecent')}</h2>
   {!data.recent_results?.length?<p>{t('complianceNoData')}</p>:<div className="event-list">{data.recent_results.map(r=><div className="event-item" key={r.id}><strong>{r.title} — {r.result}</strong><span>{new Date(r.completed_at).toLocaleString()} · {r.certificate_number||''}</span></div>)}</div>}
  </div>
 </section>
}
