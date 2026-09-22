import {useEffect,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadPPM,loadPPMDirectory,loadPPMHistory,ppmAction,frequencies} from '../lib/ppm'
import {Field,Select,Notice,Status} from '../components/FacilityFields'
const blankStep={title_ar:'',title_en:'',instructions_ar:'',instructions_en:'',task_type:'inspection',response_type:'pass_fail',required:true,unit:'',min_value:'',max_value:'',safety_notes:'',tools:'',materials:'',reference:''}
export default function PPMDetails(){
 const {kind,id}=useParams(),navigate=useNavigate(),{can,user}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[directory,setDirectory]=useState([]),[history,setHistory]=useState([]),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [editingStep,setEditingStep]=useState(null),[step,setStep]=useState(blankStep),[inputs,setInputs]=useState({}),[assignee,setAssignee]=useState(''),[through,setThrough]=useState(new Date(new Date().getFullYear(),11,31).toISOString().slice(0,10)),[reason,setReason]=useState('')
 const load=async()=>{
  setError('')
  try{
   const [bundle,people,events]=await Promise.all([loadPPM(),loadPPMDirectory(),loadPPMHistory(kind,id)])
   setData(bundle);setDirectory(people);setHistory(events)
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[kind,id])
 const row=(kind==='procedure'?data?.procedures:kind==='plan'?data?.plans:data?.jobs)?.find(x=>x.id===id)
 const manager=row&&can('ppm.manage',row.organization_id),approver=row&&can('ppm.approve',row.organization_id)
 const executor=row&&can('ppm.execute',row.organization_id)&&row.assigned_to===user?.id
 const name=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const options=(rows,label)=>[{value:'',label:t('select')},...(rows||[]).map(x=>({value:x.id,label:label(x)}))]
 const run=async(command,payload={},target=kind)=>{
  if(busy)return
  if(['archive','approve','close','reject','generate','activate'].includes(command)&&!confirm(t('confirmAction')))return
  setBusy(true);setError('');setSuccess('')
  try{
   const result=await ppmAction(target,id,command,payload)
   if(command==='revise'){navigate('/ppm/procedure/'+result);return}
   await load();setSuccess(t('saved'))
   if(['add_step','update_step','delete_step'].includes(command)){setStep(blankStep);setEditingStep(null)}
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const button=(command,enabled,payload={},primary=false)=>enabled?<button type="button" disabled={busy} className={'btn '+(primary?'primary':'secondary')} onClick={()=>run(command,payload)}>{t(command)}</button>:null
 const details=(items)=><div className="form-grid">{items.map(([key,value])=><div key={key}><span className="muted">{t(key)}</span><p>{value??'—'}</p></div>)}</div>
 const steps=kind==='procedure'?data?.steps.filter(x=>x.procedure_id===id).sort((a,b)=>a.seq-b.seq)||[]:kind==='job'?(row?.procedure_snapshot?.steps||[]):[]
 const results=data?.results.filter(x=>x.job_id===id)||[]
 const resultFor=stepId=>results.find(x=>x.step_id===stepId)
 const update=(stepId,key,value)=>setInputs(old=>({...old,[stepId]:{...old[stepId],[key]:value}}))
 const resultField=(s,key)=>inputs[s.id]?.[key]??resultFor(s.id)?.[key]??''
 const saveResult=s=>run('result',{step_id:s.id,result:resultField(s,'result'),reading:resultField(s,'reading'),comment:resultField(s,'comment')})
 const followup=async s=>{
  if(!confirm(t('confirmAction')))return
  setBusy(true);setError('')
  try{const requestId=await ppmAction('job',id,'followup',{step_id:s.id});await load();setSuccess(t('saved'))}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const stepForm=async e=>{e.preventDefault();await run(editingStep?'update_step':'add_step',{...step,...(editingStep?{step_id:editingStep}:{})})}
 const editStep=s=>{setEditingStep(s.id);setStep({...blankStep,...s,min_value:s.min_value??'',max_value:s.max_value??''})}
 const deleteStep=s=>{if(confirm(t('confirmAction')))run('delete_step',{step_id:s.id})}
 return <section className="facility-module">
  <div className="page-head"><div><Link to="/ppm">← {t('ppm')}</Link><h1>{row?.code||row?.job_number||t('loading')}</h1><p className="muted">{row&&t(row.frequency||'')}{row?.version?' · '+t('version')+' '+row.version:''}</p></div><button className="btn secondary" onClick={load}>{t('refresh')}</button></div>
  <Notice error={error} success={success}/>
  {!row?data?<p>{t('noData')}</p>:<p>{t('loading')}</p>:<>
   <div className="facility-panel">
    <h3>{t(kind)}</h3>
    {kind==='procedure'?details([['nameAr',row.name_ar],['nameEn',row.name_en],['frequency',t(row.frequency)],['category',name(data.categories.find(x=>x.id===row.category_id))],['manufacturer',row.manufacturer],['model',row.model],['reference',row.reference],['estimatedMinutes',row.estimated_minutes],['status',t(row.status)]]):
    kind==='plan'?details([['asset',data.assets.find(x=>x.id===row.asset_id)?.asset_tag],['procedure',data.procedures.find(x=>x.id===row.procedure_id)?.code],['frequency',t(row.frequency)],['startDate',row.start_date],['nextDue',row.next_due],['intervalCount',row.interval_count],['status',t(row.status)]]):
    details([['asset',data.assets.find(x=>x.id===row.asset_id)?.asset_tag],['plan',data.plans.find(x=>x.id===row.plan_id)?.code],['dueDate',row.due_date],['status',t(row.status)],['assignedTo',directory.find(x=>x.id===row.assigned_to)?.full_name||row.assigned_to],['workOrder',row.work_order_id?<Link to={'/corrective/work_order/'+row.work_order_id}>{data.workOrders?.find(x=>x.id===row.work_order_id)?.work_order_number||row.work_order_id}</Link>:'—'],['version',row.procedure_snapshot?.version]])}
    {kind==='procedure'&&<p className="muted">{t('procedureNotice')}</p>}
   </div>
   {kind==='procedure'&&<>
    <div className="facility-panel"><h3>{t('checklist')}</h3>
     {steps.map(s=><div key={s.id} className="facility-panel" style={{marginBlock:'12px'}}><strong>{s.seq}. {name({name_ar:s.title_ar,name_en:s.title_en})}</strong><p>{lang==='ar'?s.instructions_ar:s.instructions_en}</p>{details([['taskType',t(s.task_type)],['responseType',t(s.response_type)],['required',s.required?'✓':'—'],['unit',s.unit],['minValue',s.min_value],['maxValue',s.max_value],['safetyNotes',s.safety_notes],['tools',s.tools],['materials',s.materials],['reference',s.reference]])}{manager&&row.status==='draft'&&<div className="row-actions"><button className="btn xs secondary" onClick={()=>editStep(s)}>{t('editStep')}</button><button className="btn xs danger-soft" onClick={()=>deleteStep(s)}>{t('deleteStep')}</button></div>}</div>)}
     {!steps.length&&<p>{t('noData')}</p>}
     {manager&&row.status==='draft'&&<form className="facility-form" onSubmit={stepForm}><h3>{t(editingStep?'editStep':'addStep')}</h3><div className="form-grid">
      {['title_ar','title_en','instructions_ar','instructions_en','safety_notes','tools','materials','reference'].map(key=><Field key={key} label={t(({title_ar:'nameAr',title_en:'nameEn',instructions_ar:'instructionsAr',instructions_en:'instructionsEn',safety_notes:'safetyNotes'})[key]||key)} required={['title_ar','title_en'].includes(key)}><textarea required={['title_ar','title_en'].includes(key)} value={step[key]} onChange={e=>setStep(f=>({...f,[key]:e.target.value}))}/></Field>)}
      <Field label={t('taskType')}><Select value={step.task_type} onChange={v=>setStep(f=>({...f,task_type:v}))} options={['inspection','cleaning','lubrication','adjustment','test','replacement','safety','other'].map(x=>({value:x,label:t(x)}))}/></Field>
      <Field label={t('responseType')}><Select value={step.response_type} onChange={v=>setStep(f=>({...f,response_type:v}))} options={['pass_fail','reading','text'].map(x=>({value:x,label:t(x)}))}/></Field>
      <Field label={t('unit')}><input value={step.unit} onChange={e=>setStep(f=>({...f,unit:e.target.value}))}/></Field>
      <Field label={t('minValue')}><input type="number" step="any" value={step.min_value} onChange={e=>setStep(f=>({...f,min_value:e.target.value}))}/></Field>
      <Field label={t('maxValue')}><input type="number" step="any" value={step.max_value} onChange={e=>setStep(f=>({...f,max_value:e.target.value}))}/></Field>
      <label><input type="checkbox" checked={step.required} onChange={e=>setStep(f=>({...f,required:e.target.checked}))}/>{t('required')}</label>
     </div><div className="row-actions"><button disabled={busy} className="btn primary" type="submit">{t(editingStep?'save':'addStep')}</button>{editingStep&&<button type="button" className="btn secondary" onClick={()=>{setEditingStep(null);setStep(blankStep)}}>{t('cancel')}</button>}</div></form>}
     {manager&&<div className="row-actions">{button('approve',row.status==='draft'&&steps.length>0,{},true)}{button('revise',row.status==='approved')}{button('archive',['draft','approved'].includes(row.status))}</div>}
    </div>
   </>}
   {kind==='plan'&&<>
    <div className="facility-panel"><h3>{t('actions')}</h3><div className="row-actions">{button('activate',manager&&['draft','paused'].includes(row.status),{},true)}{button('pause',manager&&row.status==='active')}{button('archive',manager&&['draft','paused'].includes(row.status))}</div></div>
    {manager&&row.status==='active'&&<div className="facility-panel"><h3>{t('generate')}</h3><p className="muted">{t('scheduleNotice')}</p><Field label={t('throughDate')}><input type="date" value={through} onChange={e=>setThrough(e.target.value)}/></Field><div className="row-actions">{button('generate',true,{through_date:through},true)}</div></div>}
    <div className="facility-panel"><h3>{t('ppmJobs')}</h3>{data.jobs.filter(x=>x.plan_id===id).sort((a,b)=>a.due_date.localeCompare(b.due_date)).map(j=><div key={j.id} className="row-actions" style={{padding:'8px 0'}}><Link to={'/ppm/job/'+j.id}>{j.job_number}</Link><span>{j.due_date}</span><Status value={j.status}/></div>)}</div>
   </>}
   {kind==='job'&&<>
    <div className="facility-panel"><h3>{t('actions')}</h3>
     {manager&&['scheduled','assigned'].includes(row.status)&&<div className="form-grid"><Field label={t('assignedTo')}><Select value={assignee} onChange={setAssignee} options={options(directory.filter(x=>x.organization_id===row.organization_id),x=>x.full_name||x.email)}/></Field><div className="row-actions">{button('assign',!!assignee,{user_id:assignee},true)}</div></div>}
     <div className="row-actions">{button('start',executor&&row.status==='assigned',{},true)}{button('complete',executor&&row.status==='in_progress',{},true)}{button('approve',approver&&row.status==='completed',{},true)}{button('close',approver&&row.status==='approved',{},true)}</div>
     {manager&&row.status==='completed'&&<><Field label={t('reason')}><textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field>{button('reject',reason.trim().length>=5,{reason})}</>}
     <p className="muted">{t('executionNotice')}</p>
    </div>
    <div className="facility-panel"><h3>{t('checklist')}</h3>
     {steps.map(s=><div key={s.id} className="facility-panel" style={{marginBlock:'12px'}}>
      <strong>{s.seq}. {name({name_ar:s.title_ar,name_en:s.title_en})}</strong><p>{lang==='ar'?s.instructions_ar:s.instructions_en}</p>
      {details([['safetyNotes',s.safety_notes],['tools',s.tools],['materials',s.materials],['unit',s.unit],['minValue',s.min_value],['maxValue',s.max_value]])}
      {executor&&row.status==='in_progress'?<div className="form-grid">
       <Field label={t('result')}><Select value={resultField(s,'result')} onChange={v=>update(s.id,'result',v)} options={[{value:'',label:t('select')},...['pass','fail',...(s.required?[]:['na'])].map(v=>({value:v,label:t(v)}))]}/></Field>
       {s.response_type==='reading'&&<Field label={t('reading')}><input type="number" step="any" value={resultField(s,'reading')} onChange={e=>update(s.id,'reading',e.target.value)}/></Field>}
       <Field label={t('comment')}><textarea value={resultField(s,'comment')} onChange={e=>update(s.id,'comment',e.target.value)}/></Field>
       <div className="row-actions"><button type="button" disabled={busy||!resultField(s,'result')} className="btn primary" onClick={()=>saveResult(s)}>{t('save')}</button></div>
      </div>:<p><Status value={resultFor(s.id)?.result||'not_submitted'}/> {resultFor(s.id)?.reading??''} {resultFor(s.id)?.comment||''}</p>}
      {resultFor(s.id)?.result==='fail'&&(manager||executor)&&<div className="row-actions">
       {data.followups.find(f=>f.job_id===id&&f.step_id===s.id)?<Link to={'/corrective/request/'+data.followups.find(f=>f.job_id===id&&f.step_id===s.id).request_id}>{t('followupCreated')}</Link>:<button type="button" disabled={busy} className="btn secondary" onClick={()=>followup(s)}>{t('followup')}</button>}
      </div>}
     </div>)}
     <p className="muted">{t('qaNotice')}</p>
    </div>
   </>}
   <div className="facility-panel"><h3>{t('history')}</h3>{history.map(e=><div key={e.id} style={{padding:'8px 0',borderBottom:'1px solid #ddd'}}><strong>{t(e.action)}</strong><p className="muted">{new Date(e.created_at).toLocaleString(lang)}</p>{e.details?.reason&&<p>{e.details.reason}</p>}</div>)}</div>
  </>}
 </section>
}
