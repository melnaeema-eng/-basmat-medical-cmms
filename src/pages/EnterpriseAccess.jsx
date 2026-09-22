import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadEnterpriseAccess,assignEnterpriseScope,setEnterpriseScopeActive} from '../lib/enterpriseAccess'
import {supabase} from '../lib/supabaseClient'

export default function EnterpriseAccess(){
 const {t}=useLanguage()
 const [dir,setDir]=useState({orgs:[],users:[],clients:[],contracts:[],sites:[]})
 const [org,setOrg]=useState('')
 const [data,setData]=useState({roles:[],assignments:[],scope_levels:[]})
 const [form,setForm]=useState({user_id:'',role_id:'',scope_level:'organization',client_id:'',contract_id:'',site_id:'',discipline_code:'',valid_from:'',valid_until:''})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')

 useEffect(()=>{Promise.all([
  supabase.from('bf_organizations').select('id,name').eq('status','active'),
  supabase.from('bf_profiles').select('id,full_name,email,status').eq('status','active'),
  supabase.from('bf_clients').select('id,organization_id,name').eq('status','active'),
  supabase.from('bf_contracts').select('id,organization_id,client_id,contract_number,status'),
  supabase.from('bf_sites').select('id,organization_id,client_id,name').eq('status','active')
 ]).then(rs=>{
  const x={orgs:rs[0].data||[],users:rs[1].data||[],clients:rs[2].data||[],contracts:rs[3].data||[],sites:rs[4].data||[]}
  setDir(x); if(x.orgs[0])setOrg(x.orgs[0].id)
 })},[])

 const load=async(id=org)=>{if(!id)return;setBusy(true);setError('');try{setData(await loadEnterpriseAccess(id))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{if(org){setForm(v=>({...v,client_id:'',contract_id:'',site_id:''}));load(org)}},[org])

 const clients=useMemo(()=>dir.clients.filter(x=>x.organization_id===org),[dir.clients,org])
 const contracts=useMemo(()=>dir.contracts.filter(x=>x.organization_id===org&&(!form.client_id||x.client_id===form.client_id)),[dir.contracts,org,form.client_id])
 const sites=useMemo(()=>dir.sites.filter(x=>x.organization_id===org&&(!form.client_id||x.client_id===form.client_id)),[dir.sites,org,form.client_id])

 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{
  await assignEnterpriseScope({...form,organization_id:org});setForm(v=>({...v,user_id:'',role_id:'',client_id:'',contract_id:'',site_id:'',discipline_code:'',valid_from:'',valid_until:''}));await load()
 }catch(e){setError(e.message)}finally{setBusy(false)}}

 const toggle=async a=>{setBusy(true);setError('');try{await setEnterpriseScopeActive(a.id,!a.is_active);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}

 return <section className="facility-module">
  <div className="page-head"><h1>{t('enterpriseAccessTitle')}</h1><button className="btn secondary" onClick={()=>load()}>{t('eaRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="facility-panel"><div className="form-grid">
   <label>{t('eaOrg')}<select value={org} onChange={e=>setOrg(e.target.value)}>{dir.orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
  </div></div>
  <form className="facility-panel" onSubmit={submit}><h2>{t('eaAssign')}</h2><div className="form-grid">
   <label>{t('eaUser')}<select required value={form.user_id} onChange={e=>setForm(v=>({...v,user_id:e.target.value}))}><option value="">—</option>{dir.users.map(x=><option key={x.id} value={x.id}>{x.full_name||x.email}</option>)}</select></label>
   <label>{t('eaRole')}<select required value={form.role_id} onChange={e=>setForm(v=>({...v,role_id:e.target.value}))}><option value="">—</option>{(data.roles||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('eaScope')}<select value={form.scope_level} onChange={e=>setForm(v=>({...v,scope_level:e.target.value,client_id:'',contract_id:'',site_id:'',discipline_code:''}))}>{(data.scope_levels||['organization','client','contract','site','discipline']).map(x=><option key={x}>{x}</option>)}</select></label>
   {['client','contract','site'].includes(form.scope_level)&&<label>{t('eaClient')}<select required value={form.client_id} onChange={e=>setForm(v=>({...v,client_id:e.target.value,contract_id:'',site_id:''}))}><option value="">—</option>{clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   {form.scope_level==='contract'&&<label>{t('eaContract')}<select required value={form.contract_id} onChange={e=>setForm(v=>({...v,contract_id:e.target.value}))}><option value="">—</option>{contracts.map(x=><option key={x.id} value={x.id}>{x.contract_number}</option>)}</select></label>}
   {form.scope_level==='site'&&<label>{t('eaSite')}<select required value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value}))}><option value="">—</option>{sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
   {form.scope_level==='discipline'&&<label>{t('eaDiscipline')}<input required value={form.discipline_code} onChange={e=>setForm(v=>({...v,discipline_code:e.target.value}))} placeholder="HVAC / Electrical / Cleaning"/></label>}
   <label>{t('eaFrom')}<input type="date" value={form.valid_from} onChange={e=>setForm(v=>({...v,valid_from:e.target.value}))}/></label>
   <label>{t('eaUntil')}<input type="date" value={form.valid_until} onChange={e=>setForm(v=>({...v,valid_until:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy||!org}>{t('eaAssign')}</button></form>

  <div className="facility-panel"><h2>{t('eaAssignments')}</h2><div className="table-wrap"><table><thead><tr><th>{t('eaUser')}</th><th>{t('eaRole')}</th><th>{t('eaScope')}</th><th>{t('eaDiscipline')}</th><th>{t('eaStatus')}</th></tr></thead><tbody>{(data.assignments||[]).map(a=><tr key={a.id}><td>{a.user_name||a.email}</td><td>{a.role_name}</td><td>{a.scope_level}</td><td>{a.discipline_code||'—'}</td><td><button className="btn xs secondary" onClick={()=>toggle(a)}>{a.is_active?t('eaActive'):t('eaInactive')}</button></td></tr>)}</tbody></table></div></div>

  <div className="facility-panel"><h2>{t('eaRoleTemplates')}</h2><div className="security-check-list">{(data.roles||[]).map(r=><article className="security-check-card" key={r.id}><div className="security-check-main"><div><strong>{r.name}</strong><p>{r.code}</p></div></div><details className="security-human-details"><summary>{t('eaPermissions')} ({r.permissions?.length||0})</summary><div className="security-detail-list">{(r.permissions||[]).map(p=><div key={p}>{p}</div>)}</div></details></article>)}</div></div>
 </section>
}
