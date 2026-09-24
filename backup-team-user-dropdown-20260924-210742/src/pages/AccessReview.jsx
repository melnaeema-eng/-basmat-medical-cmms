import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {supabase} from '../lib/supabaseClient'
import AutoQr from '../components/AutoQr'
import {loadAccessReview,createAccessRequest,decideAccessRequest,reviewAccessScope,processExpiredAccess} from '../lib/accessReview'
import {loadAccessReviewDirectory} from '../lib/accessReviewDirectory'

export default function AccessReview(){
 const {t}=useLanguage()
 const [dir,setDir]=useState({orgs:[],users:[],roles:[],clients:[],contracts:[],sites:[]})
 const [org,setOrg]=useState(''),[data,setData]=useState({summary:{},requests:[],expiring_scopes:[]})
 const [form,setForm]=useState({request_type:'new_access',subject_user_id:'',role_id:'',existing_scope_id:'',scope_level:'organization',client_id:'',contract_id:'',site_id:'',discipline_code:'',valid_from:'',valid_until:'',justification:''})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')

 useEffect(()=>{supabase.from('bf_organizations').select('id,name').eq('status','active').then(({data,error})=>{if(error){setError(error.message);return}const orgs=data||[];setDir(v=>({...v,orgs}));if(orgs[0])setOrg(orgs[0].id)})},[])

 useEffect(()=>{if(!org)return;Promise.all([
  loadAccessReviewDirectory(org),
  supabase.from('bf_clients').select('id,organization_id,name').eq('status','active'),
  supabase.from('bf_contracts').select('id,organization_id,client_id,contract_number,status'),
  supabase.from('bf_sites').select('id,organization_id,client_id,name').eq('status','active')
 ]).then(rs=>{setDir(v=>({...v,users:rs[0].users||[],roles:rs[0].roles||[],scopes:rs[0].scopes||[],clients:rs[1].data||[],contracts:rs[2].data||[],sites:rs[3].data||[]}))}).catch(e=>setError(e.message))},[org])

 const load=async()=>{if(!org)return;setBusy(true);setError('');try{setData(await loadAccessReview(org))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[org])

 const users=useMemo(()=>dir.users.filter(x=>x.organization_id===org),[dir.users,org])
 const roles=useMemo(()=>dir.roles.filter(x=>!x.organization_id||x.organization_id===org),[dir.roles,org])
 const clients=useMemo(()=>dir.clients.filter(x=>x.organization_id===org),[dir.clients,org])
 const contracts=useMemo(()=>dir.contracts.filter(x=>x.organization_id===org&&(!form.client_id||x.client_id===form.client_id)),[dir.contracts,org,form.client_id])
 const sites=useMemo(()=>dir.sites.filter(x=>x.organization_id===org&&(!form.client_id||x.client_id===form.client_id)),[dir.sites,org,form.client_id])

 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{await createAccessRequest({...form,organization_id:org});setForm(v=>({...v,justification:'',valid_until:''}));await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const decide=async(id,d)=>{const note=window.prompt('Decision note / ملاحظة القرار','')||'';setBusy(true);setError('');try{await decideAccessRequest(id,d,note);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const review=async(id,d)=>{const note=window.prompt('Review note / ملاحظة المراجعة','')||'';setBusy(true);setError('');try{await reviewAccessScope(id,d,note);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const s=data.summary||{}

 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('accessReviewTitle')}</h1><p className="muted">{t('accessReviewWorkflow')}</p></div><div className="form-actions"><button className="btn secondary" onClick={load}>{t('arRefresh')}</button><button className="btn secondary" onClick={()=>{setBusy(true);processExpiredAccess().then(load).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>{t('arProcessExpired')}</button></div></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="security-mini-grid"><div><span>{t('arPending')}</span><strong>{s.pending_requests||0}</strong></div><div><span>{t('arActiveScopes')}</span><strong>{s.active_scopes||0}</strong></div><div><span>{t('arExpiring')}</span><strong>{s.temporary_expiring_30d||0}</strong></div><div><span>{t('arExpired')}</span><strong>{s.expired_active||0}</strong></div></div>

  <div className="facility-panel"><label>{t('arOrg')}<select value={org} onChange={e=>setOrg(e.target.value)}>{dir.orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>

  <form className="facility-panel" onSubmit={submit}><h2>{t('arNew')}</h2><div className="form-grid">
   <label>{t('arType')}<select value={form.request_type} onChange={e=>setForm(v=>({...v,request_type:e.target.value}))}>{['new_access','change_scope','temporary_access','revoke_access'].map(x=><option key={x} value={x}>{t(x)}</option>)}</select></label>
   <label>{t('arUser')}<select required value={form.subject_user_id} onChange={e=>setForm(v=>({...v,subject_user_id:e.target.value}))}><option value="">—</option>{users.map(x=><option key={x.id} value={x.id}>{x.full_name||x.email}</option>)}</select></label>
   {form.request_type!=='revoke_access'&&<><label>{t('arRole')}<select required value={form.role_id} onChange={e=>setForm(v=>({...v,role_id:e.target.value}))}><option value="">—</option>{roles.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('arScope')}<select value={form.scope_level} onChange={e=>setForm(v=>({...v,scope_level:e.target.value,client_id:'',contract_id:'',site_id:'',discipline_code:''}))}>{['organization','client','contract','site','discipline'].map(x=><option key={x}>{x}</option>)}</select></label>
   {['client','contract','site'].includes(form.scope_level)&&<label>{t('arClient')}<select required value={form.client_id} onChange={e=>setForm(v=>({...v,client_id:e.target.value,contract_id:'',site_id:''}))}><option value="">—</option>{clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   {form.scope_level==='contract'&&<label>{t('arContract')}<select required value={form.contract_id} onChange={e=>setForm(v=>({...v,contract_id:e.target.value}))}><option value="">—</option>{contracts.map(x=><option key={x.id} value={x.id}>{x.contract_number}</option>)}</select></label>}
   {form.scope_level==='site'&&<label>{t('arSite')}<select required value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value}))}><option value="">—</option>{sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   {form.scope_level==='discipline'&&<label>{t('arDiscipline')}<input required value={form.discipline_code} onChange={e=>setForm(v=>({...v,discipline_code:e.target.value}))}/></label>}
   <label>{t('arFrom')}<input type="date" value={form.valid_from} onChange={e=>setForm(v=>({...v,valid_from:e.target.value}))}/></label>
   <label>{t('arUntil')}<input type="date" required={form.request_type==='temporary_access'} value={form.valid_until} onChange={e=>setForm(v=>({...v,valid_until:e.target.value}))}/></label></>}
   <label className="span-2">{t('arJustification')}<textarea required value={form.justification} onChange={e=>setForm(v=>({...v,justification:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy}>{t('arSubmit')}</button></form>

  <div className="facility-panel"><h2>{t('arRequests')}</h2><div className="security-check-list">{(data.requests||[]).map(q=><article className="security-check-card" key={q.id}><div><strong>{q.request_no} — {q.subject_name}</strong><p>{t(q.request_type)} · {q.role_code||'—'} · {q.scope_level||'—'} · {q.status}</p><small>{q.justification}</small></div><div className="form-actions">{q.status==='pending'&&<><button className="btn primary" onClick={()=>decide(q.id,'approve')}>{t('arApprove')}</button><button className="btn secondary" onClick={()=>decide(q.id,'reject')}>{t('arReject')}</button></>}<details><summary>QR</summary><AutoQr value={q.qr_payload} size={110}/></details></div></article>)}</div></div>

  <div className="facility-panel"><h2>{t('arExpiringScopes')}</h2><div className="security-check-list">{(data.expiring_scopes||[]).map(x=><article className="security-check-card" key={x.id}><div><strong>{x.user_name}</strong><p>{x.role_code} · {x.scope_level} · {x.valid_until}</p></div><div className="form-actions"><button className="btn secondary" onClick={()=>review(x.id,'retain')}>{t('arRetain')}</button><button className="btn secondary" onClick={()=>review(x.id,'revoke')}>{t('arRevoke')}</button></div></article>)}</div></div>
 </section>
}
