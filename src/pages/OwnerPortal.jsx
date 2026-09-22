import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadOwnerPortal,createOwnerRequest,decideOwnerApproval} from '../lib/ownerPortal'

export default function OwnerPortal(){
 const {t}=useLanguage()
 const [data,setData]=useState({clients:[],sites:[],assets:[],requests:[],work_orders:[],ppm:[],approvals:[],documents:[],summary:{}})
 const [clientId,setClientId]=useState('')
 const [form,setForm]=useState({site_id:'',asset_id:'',title:'',description:'',priority:'P3'})
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const load=async(id=clientId)=>{setBusy(true);setError('');try{const d=await loadOwnerPortal(id||null);setData(d);if(!id&&d.clients?.length===1)setClientId(d.clients[0].client_id)}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load('')},[])
 const client=useMemo(()=>data.clients?.find(x=>x.client_id===clientId)||data.clients?.[0],[data.clients,clientId])
 const sites=useMemo(()=>data.sites?.filter(x=>!client||x.client_id===client.client_id)||[],[data.sites,client])
 const assets=useMemo(()=>data.assets?.filter(x=>!form.site_id||x.site_id===form.site_id)||[],[data.assets,form.site_id])
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('');setMessage('')
  try{
   const site=sites.find(x=>x.id===form.site_id)
   await createOwnerRequest({...form,organization_id:client.organization_id,client_id:client.client_id,contract_id:site?.contract_id||null})
   setForm({site_id:'',asset_id:'',title:'',description:'',priority:'P3'});setMessage(t('ownerCreated'));await load(client.client_id)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const decide=async(id,decision)=>{
  const comment=decision==='reject'?window.prompt(t('ownerComment'))||'':''
  if(decision==='reject'&&comment.trim().length<5)return
  try{setBusy(true);await decideOwnerApproval(id,decision,comment);await load(client?.client_id)}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const s=data.summary||{}
 return <section className="facility-module">
  <div className="page-head"><h1>{t('ownerPortalTitle')}</h1><button className="btn secondary" onClick={()=>load(client?.client_id)} disabled={busy}>{t('ownerRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}{message&&<div className="facility-panel">{message}</div>}
  {data.clients?.length>1&&<div className="facility-panel"><label>{t('ownerClient')}<select value={clientId} onChange={e=>{setClientId(e.target.value);load(e.target.value)}}><option value="">—</option>{data.clients.map(c=><option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}</select></label></div>}
  <div className="stats-grid facility-stats">{[['ownerSites',s.sites],['ownerAssets',s.assets],['ownerRequests',s.open_requests],['ownerWorkOrders',s.open_work_orders],['ownerPpm',s.ppm_due],['ownerApprovals',s.pending_approvals],['ownerDocuments',s.documents]].map(([k,v])=><div className="stat-card" key={k}><span>{t(k)}</span><strong>{v??0}</strong></div>)}</div>
  {client&&<form className="facility-panel" onSubmit={submit}><h2>{t('ownerNewRequest')}</h2><div className="form-grid">
   <label>{t('ownerSite')}<select required value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value,asset_id:''}))}><option value="">—</option>{sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('ownerAsset')}<select value={form.asset_id} onChange={e=>setForm(v=>({...v,asset_id:e.target.value}))}><option value="">—</option>{assets.map(x=><option key={x.id} value={x.id}>{x.asset_tag} — {x.name_ar||x.name_en}</option>)}</select></label>
   <label>{t('ownerPriority')}<select value={form.priority} onChange={e=>setForm(v=>({...v,priority:e.target.value}))}>{['P1','P2','P3','P4'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label>{t('ownerTitle')}<input required minLength={3} value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
   <label>{t('ownerDescription')}<input value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy}>{t('ownerSubmit')}</button></form>}
  <PortalTable title={t('ownerRequestList')} rows={data.requests} cols={[[t('ownerNumber'),'request_number'],[t('ownerTitle'),'title'],[t('ownerPriority'),'priority'],[t('ownerStatus'),'status']]}/>
  <PortalTable title={t('ownerWoList')} rows={data.work_orders} cols={[[t('ownerNumber'),'work_order_number'],[t('ownerTitle'),'title'],[t('ownerPriority'),'priority'],[t('ownerStatus'),'status'],['SLA','sla_status']]}/>
  <PortalTable title={t('ownerPpmList')} rows={data.ppm} cols={[[t('ownerNumber'),'job_number'],[t('ownerDue'),'due_date'],[t('ownerStatus'),'status']]}/>
  <div className="facility-panel"><h2>{t('ownerApprovalList')}</h2>{!data.approvals?.length?<p>{t('ownerNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('ownerSubject')}</th><th>{t('ownerStatus')}</th><th>{t('ownerDue')}</th><th></th></tr></thead><tbody>{data.approvals.map(a=><tr key={a.id}><td>{a.subject}</td><td>{a.status}</td><td>{a.due_at||'—'}</td><td>{a.status==='pending'&&<><button className="btn xs primary" onClick={()=>decide(a.id,'approve')}>{t('ownerApprove')}</button> <button className="btn xs danger-soft" onClick={()=>decide(a.id,'reject')}>{t('ownerReject')}</button></>}</td></tr>)}</tbody></table></div>}</div>
  <PortalTable title={t('ownerDocList')} rows={data.documents} cols={[[t('ownerNumber'),'document_number'],[t('ownerTitle'),'title'],['Type','document_type'],[t('ownerStatus'),'status']]}/>
 </section>
}
function PortalTable({title,rows=[],cols=[]}){const {t}=useLanguage();return <div className="facility-panel"><h2>{title}</h2>{!rows.length?<p>{t('ownerNoData')}</p>:<div className="table-wrap"><table><thead><tr>{cols.map(([h])=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id||i}>{cols.map(([h,k])=><td key={h}>{r[k]??'—'}</td>)}</tr>)}</tbody></table></div>}</div>}
