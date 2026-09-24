import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadWorkforce,scheduleWork,cancelWork,completeWork} from '../lib/workforce'

const iso=d=>d.toISOString().slice(0,10)
const localValue=d=>{
 const x=new Date(d-Date.now()%60000)
 return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,16)
}

export default function WorkforceDispatch(){
 const {t}=useLanguage()
 const today=new Date(),end=new Date(Date.now()+7*86400000)
 const [from,setFrom]=useState(iso(today)),[to,setTo]=useState(iso(end))
 const [data,setData]=useState({technicians:[],slots:[],unscheduled:[],workload:[],summary:{}})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [form,setForm]=useState({
  task_type:'',task_id:'',technician_id:'',
  scheduled_start:localValue(Date.now()+3600000),
  scheduled_end:localValue(Date.now()+3*3600000),notes:''
 })

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const x=await loadWorkforce({from,to})
   setData(x)
   if(!form.task_id&&x.unscheduled?.[0])setForm(v=>({...v,task_type:x.unscheduled[0].task_type,task_id:x.unscheduled[0].id}))
   if(!form.technician_id&&x.technicians?.[0])setForm(v=>({...v,technician_id:x.technicians[0].id}))
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const tasks=data.unscheduled||[]
 const availableTech=(data.technicians||[]).filter(x=>{
  if(!form.task_type)return true
  return form.task_type==='work_order'?x.corrective_execute:x.ppm_execute
 })

 const selectTask=id=>{
  const task=tasks.find(x=>x.id===id)
  setForm(v=>({...v,task_id:id,task_type:task?.task_type||''}))
 }

 const save=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await scheduleWork(form)
   setForm(v=>({...v,task_id:'',task_type:'',notes:''}))
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const summary=data.summary||{}
 const taskLink=s=>s.task_type==='work_order'?'/corrective/work_order/'+s.task_id:'/ppm/job/'+s.task_id

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('workforceCenter')}</h1></div>
   <button className="btn secondary" onClick={load} disabled={busy}>{t('workforceRefresh')}</button>
  </div>

  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="facility-panel">
   <div className="form-grid">
    <label>{t('workforceFrom')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>{t('workforceTo')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   </div>
   <button className="btn primary" onClick={load} disabled={busy}>{t('workforceApply')}</button>
  </div>

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('workforceTechnicians')}</span><strong>{summary.technicians||0}</strong></div>
   <div className="stat-card"><span>{t('workforceBookings')}</span><strong>{summary.bookings||0}</strong></div>
   <div className="stat-card"><span>{t('workforceUnscheduledWO')}</span><strong>{summary.unscheduled_work_orders||0}</strong></div>
   <div className="stat-card"><span>{t('workforceUnscheduledPPM')}</span><strong>{summary.unscheduled_ppm||0}</strong></div>
  </div>

  <form className="facility-panel" onSubmit={save}>
   <h2>{t('workforceSchedule')}</h2>
   <div className="form-grid">
    <label>{t('workforceTask')}<select required value={form.task_id} onChange={e=>selectTask(e.target.value)}>
     <option value="">—</option>{tasks.map(x=><option key={x.task_type+'-'+x.id} value={x.id}>{x.reference} — {x.title}</option>)}
    </select></label>
    <label>{t('workforceTechnician')}<select required value={form.technician_id} onChange={e=>setForm(v=>({...v,technician_id:e.target.value}))}>
     <option value="">—</option>{availableTech.map(x=><option key={x.organization_id+'-'+x.id} value={x.id}>{x.full_name||x.email}</option>)}
    </select></label>
    <label>{t('workforceStart')}<input required type="datetime-local" value={form.scheduled_start} onChange={e=>setForm(v=>({...v,scheduled_start:e.target.value}))}/></label>
    <label>{t('workforceEnd')}<input required type="datetime-local" value={form.scheduled_end} onChange={e=>setForm(v=>({...v,scheduled_end:e.target.value}))}/></label>
    <label>{t('workforceNotes')}<textarea maxLength={2000} value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy||!form.task_id||!form.technician_id}>{t('workforceSave')}</button>
  </form>

  <div className="facility-panel">
   <h2>{t('workforceCalendar')}</h2>
   {!data.slots?.length?<p>{t('workforceNoData')}</p>:<div className="table-wrap"><table>
    <thead><tr><th>{t('workforceStart')}</th><th>{t('workforceEnd')}</th><th>{t('workforceTechnician')}</th><th>{t('workforceReference')}</th><th>{t('workforceType')}</th><th></th></tr></thead>
    <tbody>{data.slots.map(s=><tr key={s.id}>
     <td>{new Date(s.scheduled_start).toLocaleString()}</td><td>{new Date(s.scheduled_end).toLocaleString()}</td>
     <td>{s.full_name||s.email}</td><td><Link to={taskLink(s)}>{s.reference} — {s.title}</Link></td>
     <td>{s.task_type==='work_order'?t('workforceWO'):t('workforcePPM')}</td>
     <td><button className="btn xs secondary" onClick={async()=>{try{await completeWork(s.id);await load()}catch(e){setError(e.message)}}}>{t('workforceComplete')}</button>
      <button className="btn xs danger-soft" onClick={async()=>{const r=prompt(t('workforceCancel'));if(r){try{await cancelWork(s.id,r);await load()}catch(e){setError(e.message)}}}}>{t('workforceCancel')}</button></td>
    </tr>)}</tbody>
   </table></div>}
  </div>

  <div className="facility-panel">
   <h2>{t('workforceWorkload')}</h2>
   {!data.workload?.length?<p>{t('workforceNoData')}</p>:<div className="table-wrap"><table>
    <thead><tr><th>{t('workforceTechnician')}</th><th>{t('workforceBookings')}</th><th>{t('workforceHours')}</th></tr></thead>
    <tbody>{data.workload.map(x=><tr key={x.organization_id+'-'+x.technician_id}><td>{x.full_name||x.email}</td><td>{x.bookings}</td><td>{x.booked_hours}</td></tr>)}</tbody>
   </table></div>}
  </div>
 </section>
}
