import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {supabase} from '../lib/supabaseClient'
import AutoQr from '../components/AutoQr'
import {loadSoftFmDashboard,seedSoftFmTemplates,createSoftFmTask,softFmAction} from '../lib/softFm'

const today=()=>new Date().toISOString().slice(0,10)
export default function SoftFmOperations(){
 const {t}=useLanguage()
 const [dir,setDir]=useState({orgs:[],clients:[],projects:[],sites:[],teams:[],users:[]})
 const [org,setOrg]=useState(''),[date,setDate]=useState(today()),[data,setData]=useState({summary:{},tasks:[]})
 const [form,setForm]=useState({client_id:'',project_id:'',site_id:'',team_id:'',service_type:'cleaning',title:'',description:'',priority:'normal',scheduled_date:today(),due_at:'',assigned_user_id:''})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')

 useEffect(()=>{Promise.all([
  supabase.from('bf_organizations').select('id,name').eq('status','active'),
  supabase.from('bf_clients').select('id,organization_id,name').eq('status','active'),
  supabase.from('bf35_projects').select('id,organization_id,client_id,project_code,name').eq('status','active'),
  supabase.from('bf_sites').select('id,organization_id,client_id,name').eq('status','active'),
  supabase.from('bf35_teams').select('id,organization_id,project_id,site_id,team_code,name').eq('status','active'),
  supabase.rpc('bf4_staff_directory')
 ]).then(rs=>{const x={orgs:rs[0].data||[],clients:rs[1].data||[],projects:rs[2].data||[],sites:rs[3].data||[],teams:rs[4].data||[],users:rs[5].data||[]};setDir(x);if(x.orgs[0])setOrg(x.orgs[0].id)})},[])

 const load=async()=>{if(!org)return;setBusy(true);setError('');try{setData(await loadSoftFmDashboard(org,date))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[org,date])

 const clients=useMemo(()=>dir.clients.filter(x=>x.organization_id===org),[dir.clients,org])
 const projects=useMemo(()=>dir.projects.filter(x=>x.organization_id===org&&(!form.client_id||x.client_id===form.client_id)),[dir.projects,org,form.client_id])
 const sites=useMemo(()=>dir.sites.filter(x=>x.organization_id===org&&(!form.client_id||x.client_id===form.client_id)),[dir.sites,org,form.client_id])
 const teams=useMemo(()=>dir.teams.filter(x=>x.organization_id===org&&(!form.project_id||x.project_id===form.project_id)&&(!form.site_id||!x.site_id||x.site_id===form.site_id)),[dir.teams,org,form.project_id,form.site_id])
 const users=useMemo(()=>dir.users.filter(x=>x.organization_id===org),[dir.users,org])

 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{
  await createSoftFmTask({...form,organization_id:org});setForm(v=>({...v,title:'',description:'',due_at:'',assigned_user_id:''}));await load()
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 const act=async(id,action)=>{const note=action==='complete'?window.prompt('Completion note / ملاحظة الإكمال','')||'':'';setBusy(true);setError('');try{await softFmAction(id,action,note);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const s=data.summary||{}

 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('softFmTitle')}</h1><p className="muted">Cleaning · Security · Landscape · Pest Control · Waste</p></div><button className="btn secondary" onClick={load}>{t('sfRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="facility-panel"><div className="form-grid">
   <label>{t('sfOrg')}<select value={org} onChange={e=>setOrg(e.target.value)}>{dir.orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('sfDate')}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
  </div><button className="btn secondary" onClick={()=>{setBusy(true);seedSoftFmTemplates(org).then(load).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>{t('sfSeed')}</button></div>

  <div className="security-mini-grid">
   <div><span>{t('sfTotal')}</span><strong>{s.total||0}</strong></div><div><span>{t('sfOpen')}</span><strong>{s.open||0}</strong></div>
   <div><span>{t('sfAssignedCount')}</span><strong>{s.assigned||0}</strong></div><div><span>{t('sfProgress')}</span><strong>{s.in_progress||0}</strong></div>
   <div><span>{t('sfCompleted')}</span><strong>{s.completed||0}</strong></div><div><span>{t('sfOverdue')}</span><strong>{s.overdue||0}</strong></div>
  </div>

  <form className="facility-panel" onSubmit={submit}><h2>{t('sfNew')}</h2><div className="form-grid">
   <label>{t('sfClient')}<select required value={form.client_id} onChange={e=>setForm(v=>({...v,client_id:e.target.value,project_id:'',site_id:'',team_id:''}))}><option value="">—</option>{clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('sfProject')}<select value={form.project_id} onChange={e=>setForm(v=>({...v,project_id:e.target.value,team_id:''}))}><option value="">—</option>{projects.map(x=><option key={x.id} value={x.id}>{x.project_code} — {x.name}</option>)}</select></label>
   <label>{t('sfSite')}<select value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value,team_id:''}))}><option value="">—</option>{sites.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('sfTeam')}<select value={form.team_id} onChange={e=>setForm(v=>({...v,team_id:e.target.value}))}><option value="">—</option>{teams.map(x=><option key={x.id} value={x.id}>{x.team_code} — {x.name}</option>)}</select></label>
   <label>{t('sfService')}<select value={form.service_type} onChange={e=>setForm(v=>({...v,service_type:e.target.value}))}>{['cleaning','security','landscape','pest_control','waste'].map(x=><option key={x} value={x}>{t(x)}</option>)}</select></label>
   <label>{t('sfTitle')}<input required value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
   <label>{t('sfPriority')}<select value={form.priority} onChange={e=>setForm(v=>({...v,priority:e.target.value}))}>{['low','normal','high','critical'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label>{t('sfAssigned')}<select value={form.assigned_user_id} onChange={e=>setForm(v=>({...v,assigned_user_id:e.target.value}))}><option value="">—</option>{users.map(x=><option key={x.id} value={x.id}>{x.full_name||x.email}</option>)}</select></label>
   <label>{t('sfDue')}<input type="datetime-local" value={form.due_at} onChange={e=>setForm(v=>({...v,due_at:e.target.value}))}/></label>
   <label className="span-2">{t('sfDescription')}<textarea value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy}>{t('sfCreate')}</button></form>

  <div className="security-check-list">{(data.tasks||[]).map(x=><article className="facility-panel" key={x.id}><div className="page-head"><div><strong>{x.task_no} — {x.title}</strong><p className="muted">{t(x.service_type)} · {x.priority} · {x.assigned_user||'—'}</p></div><span className={`security-pill ${x.status==='completed'?'pass':''}`}>{x.status}</span></div><div className="form-actions">
   {['open','assigned'].includes(x.status)&&<button className="btn primary" onClick={()=>act(x.id,'start')}>{t('sfStart')}</button>}
   {x.status==='in_progress'&&<button className="btn primary" onClick={()=>act(x.id,'complete')}>{t('sfComplete')}</button>}
   {!['completed','cancelled'].includes(x.status)&&<button className="btn secondary" onClick={()=>act(x.id,'cancel')}>{t('sfCancel')}</button>}
  </div><details className="security-human-details"><summary>{t('sfQr')}</summary><AutoQr value={x.qr_payload} size={130}/></details></article>)}</div>
 </section>
}
