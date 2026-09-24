import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadPermitDashboard,createPermit,loadPermitDetail,addPermitControl,verifyPermitControl,permitAction} from '../lib/permit'

const localValue=(hours=0)=>{
 const d=new Date(Date.now()+hours*3600000-new Date().getTimezoneOffset()*60000)
 return d.toISOString().slice(0,16)
}

export default function PermitToWork(){
 const {t}=useLanguage()
 const [data,setData]=useState({permits:[],sites:[],assets:[],work_orders:[],summary:{}})
 const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [form,setForm]=useState({site_id:'',work_order_id:'',asset_id:'',permit_type:'general',title:'',description:'',risk_level:'medium',valid_from:localValue(),valid_to:localValue(8)})
 const [control,setControl]=useState({control_type:'ppe',description:'',mandatory:true})

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const x=await loadPermitDashboard()
   setData(x)
   if(!form.site_id&&x.sites?.[0])setForm(v=>({...v,site_id:x.sites[0].id}))
   if(selected){setDetail(await loadPermitDetail(selected))}
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const openDetail=async id=>{
  setSelected(id);setBusy(true);setError('')
  try{setDetail(await loadPermitDetail(id))}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const savePermit=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   const id=await createPermit(form)
   setForm(v=>({...v,title:'',description:'',work_order_id:'',asset_id:'',valid_from:localValue(),valid_to:localValue(8)}))
   await load()
   await openDetail(id)
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const saveControl=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await addPermitControl({...control,permit_id:selected})
   setControl(v=>({...v,description:''}))
   await openDetail(selected);await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const act=async(action,reason=null)=>{
  try{setBusy(true);setError('');await permitAction(selected,action,reason);await openDetail(selected);await load()}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const filteredAssets=(data.assets||[]).filter(a=>a.site_id===form.site_id)
 const filteredWO=(data.work_orders||[]).filter(w=>w.site_id===form.site_id)
 const s=data.summary||{}
 const p=detail?.permit
 const typeLabel=x=>({
  hot_work:t('permitHotWork'),electrical:t('permitElectrical'),confined_space:t('permitConfined'),
  working_at_height:t('permitHeight'),excavation:t('permitExcavation'),general:t('permitGeneral')
 }[x]||x)
 const controlLabel=x=>({
  isolation:t('permitIsolation'),lockout_tagout:t('permitLoto'),gas_test:t('permitGas'),
  fire_watch:t('permitFireWatch'),ppe:t('permitPpe'),barrier:t('permitBarrier'),
  toolbox_talk:t('permitToolbox'),other:t('permitOther')
 }[x]||x)

 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('permitCenter')}</h1></div><button className="btn secondary" onClick={load} disabled={busy}>{t('permitRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('permitTotal')}</span><strong>{s.total||0}</strong></div>
   <div className="stat-card"><span>{t('permitSubmitted')}</span><strong>{s.submitted||0}</strong></div>
   <div className="stat-card"><span>{t('permitApproved')}</span><strong>{s.approved||0}</strong></div>
   <div className="stat-card"><span>{t('permitActive')}</span><strong>{s.active||0}</strong></div>
   <div className="stat-card"><span>{t('permitExpiring')}</span><strong>{s.expiring_24h||0}</strong></div>
   <div className="stat-card"><span>{t('permitHighRisk')}</span><strong>{s.high_risk||0}</strong></div>
  </div>

  <form className="facility-panel" onSubmit={savePermit}>
   <h2>{t('permitAdd')}</h2>
   <div className="form-grid">
    <label>{t('permitSite')}<select required value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value,asset_id:'',work_order_id:''}))}><option value="">—</option>{data.sites?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label>{t('permitWorkOrder')}<select value={form.work_order_id} onChange={e=>setForm(v=>({...v,work_order_id:e.target.value}))}><option value="">—</option>{filteredWO.map(x=><option key={x.id} value={x.id}>{x.work_order_number} — {x.title}</option>)}</select></label>
    <label>{t('permitAsset')}<select value={form.asset_id} onChange={e=>setForm(v=>({...v,asset_id:e.target.value}))}><option value="">—</option>{filteredAssets.map(x=><option key={x.id} value={x.id}>{x.asset_tag} — {x.name}</option>)}</select></label>
    <label>{t('permitType')}<select value={form.permit_type} onChange={e=>setForm(v=>({...v,permit_type:e.target.value}))}>{['general','hot_work','electrical','confined_space','working_at_height','excavation'].map(x=><option key={x} value={x}>{typeLabel(x)}</option>)}</select></label>
    <label>{t('permitRisk')}<select value={form.risk_level} onChange={e=>setForm(v=>({...v,risk_level:e.target.value}))}>{['low','medium','high','critical'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>{t('permitTitle')}<input required minLength={3} value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
    <label>{t('permitValidFrom')}<input required type="datetime-local" value={form.valid_from} onChange={e=>setForm(v=>({...v,valid_from:e.target.value}))}/></label>
    <label>{t('permitValidTo')}<input required type="datetime-local" value={form.valid_to} onChange={e=>setForm(v=>({...v,valid_to:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy}>{t('permitSave')}</button>
  </form>

  <div className="facility-panel">
   {!data.permits?.length?<p>{t('permitNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('permitNumber')}</th><th>{t('permitType')}</th><th>{t('permitSite')}</th><th>{t('permitRisk')}</th><th>{t('permitStatus')}</th><th>{t('permitValidTo')}</th><th></th></tr></thead>
   <tbody>{data.permits.map(x=><tr key={x.id}><td>{x.permit_number}</td><td>{typeLabel(x.permit_type)}</td><td>{x.site_name}</td><td>{x.risk_level}</td><td>{x.status}</td><td>{new Date(x.valid_to).toLocaleString()}</td><td><button className="btn xs secondary" onClick={()=>openDetail(x.id)}>{t('permitDetail')}</button></td></tr>)}</tbody></table></div>}
  </div>

  {p&&<div className="facility-panel">
   <h2>{p.permit_number} — {p.title}</h2><p>{p.status} · {typeLabel(p.permit_type)} · {p.risk_level}</p>
   {p.status==='draft'&&<form onSubmit={saveControl}><div className="form-grid">
    <label>{t('permitControlType')}<select value={control.control_type} onChange={e=>setControl(v=>({...v,control_type:e.target.value}))}>{['ppe','isolation','lockout_tagout','gas_test','fire_watch','barrier','toolbox_talk','other'].map(x=><option key={x} value={x}>{controlLabel(x)}</option>)}</select></label>
    <label>{t('permitControlDescription')}<input required minLength={3} value={control.description} onChange={e=>setControl(v=>({...v,description:e.target.value}))}/></label>
    <label><input type="checkbox" checked={control.mandatory} onChange={e=>setControl(v=>({...v,mandatory:e.target.checked}))}/>{t('permitMandatory')}</label>
   </div><button className="btn secondary" disabled={busy}>{t('permitAddControl')}</button></form>}

   <div className="event-list">{detail.controls?.map(c=><div className="event-item" key={c.id}><strong>{controlLabel(c.control_type)} — {c.description}</strong><span>{c.mandatory?t('permitMandatory'):''} {c.verified_at?'✓':''}</span>{!c.verified_at&&['approved','active'].includes(p.status)&&<button className="btn xs primary" onClick={async()=>{try{setBusy(true);await verifyPermitControl(c.id,'Verified');await openDetail(selected);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}}>{t('permitVerify')}</button>}</div>)}</div>

   <div className="top-actions">
    {p.status==='draft'&&<button className="btn primary" onClick={()=>act('submit')}>{t('permitSubmit')}</button>}
    {p.status==='submitted'&&<><button className="btn primary" onClick={()=>act('approve')}>{t('permitApprove')}</button><button className="btn danger-soft" onClick={()=>{const r=prompt(t('permitReject'));if(r)act('reject',r)}}>{t('permitReject')}</button></>}
    {p.status==='approved'&&<button className="btn primary" onClick={()=>act('activate')}>{t('permitActivate')}</button>}
    {p.status==='active'&&<button className="btn primary" onClick={()=>act('close')}>{t('permitClose')}</button>}
    {['draft','submitted','approved','active'].includes(p.status)&&<button className="btn danger-soft" onClick={()=>{const r=prompt(t('permitCancel'));if(r)act('cancel',r)}}>{t('permitCancel')}</button>}
   </div>
  </div>}
 </section>
}
