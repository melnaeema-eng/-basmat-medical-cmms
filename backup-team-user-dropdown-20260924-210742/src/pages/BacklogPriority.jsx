import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadBacklog,setBacklogOverride,clearBacklogOverride} from '../lib/backlog'

export default function BacklogPriority(){
 const {t}=useLanguage()
 const [data,setData]=useState({items:[],summary:{}})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [form,setForm]=useState({task_type:'',task_id:'',override_score:'80',reason:'',valid_until:''})

 const load=async()=>{
  setBusy(true);setError('')
  try{setData(await loadBacklog())}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const openOverride=x=>setForm({
  task_type:x.task_type,task_id:x.id,
  override_score:String(x.final_score||80),
  reason:x.override_reason||'',valid_until:''
 })

 const save=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await setBacklogOverride(form)
   setForm({task_type:'',task_id:'',override_score:'80',reason:'',valid_until:''})
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const clear=async x=>{
  const r=prompt(t('backlogReason'))
  if(!r)return
  try{setBusy(true);await clearBacklogOverride(x.task_type,x.id,r);await load()}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const taskLink=x=>x.task_type==='work_order'?'/corrective/work_order/'+x.id:'/ppm/job/'+x.id
 const s=data.summary||{}

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('backlogCenter')}</h1></div>
   <button className="btn secondary" onClick={load} disabled={busy}>{t('backlogRefresh')}</button>
  </div>

  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('backlogTotal')}</span><strong>{s.total||0}</strong></div>
   <div className="stat-card"><span>{t('backlogCritical')}</span><strong>{s.critical||0}</strong></div>
   <div className="stat-card"><span>{t('backlogHigh')}</span><strong>{s.high||0}</strong></div>
   <div className="stat-card"><span>{t('backlogMedium')}</span><strong>{s.medium||0}</strong></div>
   <div className="stat-card"><span>{t('backlogLow')}</span><strong>{s.low||0}</strong></div>
   <div className="stat-card"><span>{t('backlogOverrides')}</span><strong>{s.overrides||0}</strong></div>
  </div>

  {form.task_id&&<form className="facility-panel" onSubmit={save}>
   <h2>{t('backlogOverride')}</h2>
   <div className="form-grid">
    <label>{t('backlogScore')}<input required type="number" min="1" max="100" value={form.override_score} onChange={e=>setForm(v=>({...v,override_score:e.target.value}))}/></label>
    <label>{t('backlogReason')}<input required minLength={5} value={form.reason} onChange={e=>setForm(v=>({...v,reason:e.target.value}))}/></label>
    <label>{t('backlogExpiry')}<input type="datetime-local" value={form.valid_until} onChange={e=>setForm(v=>({...v,valid_until:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy}>{t('backlogSave')}</button>
  </form>}

  <div className="facility-panel">
   {!data.items?.length?<p>{t('backlogNoData')}</p>:<div className="table-wrap"><table>
    <thead><tr>
     <th>{t('backlogReference')}</th><th>{t('backlogType')}</th><th>{t('backlogTitle')}</th>
     <th>{t('backlogPriority')}</th><th>{t('backlogStatus')}</th><th>{t('backlogDue')}</th>
     <th>{t('backlogCalculated')}</th><th>{t('backlogFinal')}</th><th></th>
    </tr></thead>
    <tbody>{data.items.map(x=><tr key={x.task_type+'-'+x.id}>
     <td><Link to={taskLink(x)}>{x.reference}</Link></td>
     <td>{x.task_type==='work_order'?t('backlogWO'):t('backlogPPM')}</td>
     <td>{x.title}</td><td>{x.priority}</td><td>{x.status}</td>
     <td>{x.due_at?new Date(x.due_at).toLocaleString():'—'}</td>
     <td>{x.calculated_score}</td><td><strong>{x.final_score}</strong></td>
     <td>
      <button className="btn xs secondary" onClick={()=>openOverride(x)}>{t('backlogOverride')}</button>
      {x.override_score!=null&&<button className="btn xs danger-soft" onClick={()=>clear(x)}>{t('backlogClear')}</button>}
     </td>
    </tr>)}</tbody>
   </table></div>}
  </div>
 </section>
}
