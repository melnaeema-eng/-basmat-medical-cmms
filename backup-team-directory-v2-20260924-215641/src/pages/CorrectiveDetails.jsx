import FieldOperations from '../components/FieldOperations'
import {useEffect,useState} from 'react'
import {Link,useParams,useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadCorrective,loadHistory,action,priorities} from '../lib/corrective'
import {Field,Select,Notice,Status} from '../components/FacilityFields'
const empty={diagnosis:'',root_cause:'',work_performed:'',tests_performed:'',recommendations:'',text:'',reason:'',user_id:'',replace:false,response_due_at:'',completion_due_at:''}
export default function CorrectiveDetails(){
 const {kind,id}=useParams(),navigate=useNavigate(),{can,user}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[history,setHistory]=useState([]),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState(empty)
 const load=async()=>{
  setError('')
  try{
   const [bundle,events]=await Promise.all([loadCorrective(),loadHistory(kind,id)])
   setData(bundle);setHistory(events)
   const row=(kind==='request'?bundle.requests:bundle.workOrders).find(x=>x.id===id)
   if(row)setForm(f=>({...f,diagnosis:row.diagnosis||'',root_cause:row.root_cause||'',work_performed:row.work_performed||'',tests_performed:row.tests_performed||'',recommendations:row.recommendations||''}))
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[kind,id])
 const row=(kind==='request'?data?.requests:data?.workOrders)?.find(x=>x.id===id)
 const assigned=data?.assignments.filter(x=>x.work_order_id===id)||[]
 const manager=row&&can('corrective.manage',row.organization_id),approver=row&&can('corrective.approve',row.organization_id)
 const executor=row&&can('corrective.execute',row.organization_id)&&assigned.some(x=>x.user_id===user?.id)
 const requester=row&&can('corrective.request',row.organization_id)
 const set=(key,value)=>setForm(f=>({...f,[key]:value}))
 const run=async(command,payload={})=>{
  if(busy)return
  if(['hold','cancel','reject','reject_qa','reopen'].includes(command)&&form.reason.trim().length<5){setError(t('requiredReason'));return}
  if(['approve','close','cancel','reject','reject_qa','reopen'].includes(command)&&!confirm(t('confirmAction')))return
  setBusy(true);setError('');setSuccess('')
  try{
   const result=await action(kind,id,command,payload)
   if(command==='convert'){navigate('/corrective/work_order/'+result);return}
   await load();setSuccess(t('saved'))
   if(command==='note')setForm(f=>({...f,text:''}))
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const button=(command,enabled,payload={},primary=false)=>enabled?<button type="button" disabled={busy} className={'btn '+(primary?'primary':'secondary')} onClick={()=>run(command,payload)}>{t(command)}</button>:null
 const value=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const fields=[['organization_id','organization','organizations'],['client_id','client','clients'],['site_id','site','sites'],['contract_id','contractNumber','contracts'],['asset_id','asset','assets']]
 return <section className="facility-module">
  <div className="page-head"><div><Link to="/corrective">← {t('corrective')}</Link><h1>{row?.request_number||row?.work_order_number||t('loading')}</h1><p className="muted">{row?.title}</p></div><button className="btn secondary" onClick={load}>{t('refresh')}</button></div>
  <Notice error={error} success={success}/>
  {!row?data?<p>{t('noData')}</p>:<p>{t('loading')}</p>:<>
   <div className="stats-grid facility-stats">{[['priority',t(row.priority)],['status',t(row.status)],...(kind==='work_order'?[['approvalStatus',t(row.approval_status)],['slaStatus',t(row.sla_status)]]:[])].map(([k,v])=><div className="stat-card" key={k}><span>{t(k)}</span><strong>{v}</strong></div>)}</div>
   <div className="facility-panel"><h3>{t('requestDetails')}</h3><div className="form-grid">{fields.map(([key,label,table])=><div key={key}><span className="muted">{t(label)}</span><p>{key==='asset_id'?data?.assets.find(x=>x.id===row[key])?.asset_tag:key==='contract_id'?data?.contracts.find(x=>x.id===row[key])?.contract_number:value(data?.[table].find(x=>x.id===row[key]))||'—'}</p></div>)}</div><p>{row.description}</p></div>
   {kind==='request'?<div className="facility-panel"><h3>{t('actions')}</h3>{manager&&['submitted','triaged','converted'].includes(row.status)&&<><div className="form-grid"><Field label={t('priority')}><Select value={form.priority||row.priority} onChange={v=>set('priority',v)} options={priorities.map(x=>({value:x,label:t(x)}))}/></Field></div><div className="row-actions">{button('triage',row.status==='submitted',{priority:form.priority||row.priority})}{button('convert',true,{},true)}</div></>}{manager&&['submitted','triaged'].includes(row.status)&&<><Field label={t('reason')}><textarea value={form.reason} onChange={e=>set('reason',e.target.value)}/></Field><div className="row-actions">{button('reject',true,{reason:form.reason})}{button('cancel',true,{reason:form.reason})}</div></>}</div>:
   <>
    <div className="facility-panel"><h3>{t('assignedTo')}</h3><p>{assigned.map(a=>data.staff.find(x=>x.id===a.user_id&&x.organization_id===row.organization_id)?.full_name||a.user_id).join('، ')||t('noAssignee')}</p>
     {manager&&['draft','assigned'].includes(row.status)&&<div className="form-grid"><Field label={t('technician')}><Select value={form.user_id} onChange={v=>set('user_id',v)} options={[{value:'',label:t('select')},...data.staff.filter(x=>x.status==='active'&&x.organization_id===row.organization_id).map(x=>({value:x.id,label:x.full_name||x.email}))]}/></Field><label><input type="checkbox" checked={form.replace} onChange={e=>set('replace',e.target.checked)}/>{t('replaceAssignments')}</label><div className="row-actions">{button('assign',!!form.user_id,{user_id:form.user_id,replace:form.replace},true)}</div></div>}
    </div>
    <div className="facility-panel"><h3>{t('actions')}</h3><div className="row-actions">
     {button('accept',executor&&row.status==='assigned')}
     {button('start',executor&&row.status==='accepted')}
     {button('resume',(executor||manager)&&row.status==='on_hold')}
     {button('submit_qa',manager&&row.status==='completed')}
     {button('approve',approver&&row.status==='completed'&&row.approval_status==='pending',{},true)}
     {button('close',approver&&row.status==='approved',{},true)}
    </div><p className="muted">{t('qaNotice')}</p>
    {(manager||executor)&&['draft','assigned','accepted','in_progress','on_hold','completed','approved','closed'].includes(row.status)&&<><Field label={t('reason')}><textarea value={form.reason} onChange={e=>set('reason',e.target.value)}/></Field><div className="row-actions">
      {button('hold',row.status==='assigned'||row.status==='accepted'||row.status==='in_progress',{reason:form.reason})}
      {button('reject_qa',manager&&row.status==='completed',{reason:form.reason})}
      {button('reopen',approver&&['approved','closed'].includes(row.status),{reason:form.reason})}
      {button('cancel',manager&&(row.status==='draft'||row.status==='assigned'||row.status==='accepted'||row.status==='on_hold'),{reason:form.reason})}
     </div></>}
    </div>
    {manager&&['draft','assigned'].includes(row.status)&&<div className="facility-panel"><h3>{t('setSla')}</h3><p className="muted">{t('slaNotice')}</p><div className="form-grid"><Field label={t('responseDue')}><input type="datetime-local" value={form.response_due_at} onChange={e=>set('response_due_at',e.target.value)}/></Field><Field label={t('completionDue')}><input type="datetime-local" value={form.completion_due_at} onChange={e=>set('completion_due_at',e.target.value)}/></Field></div>{button('set_sla',true,{response_due_at:form.response_due_at?new Date(form.response_due_at).toISOString():null,completion_due_at:form.completion_due_at?new Date(form.completion_due_at).toISOString():null})}</div>}
    {(manager||executor)&&<FieldOperations workOrder={row} onRefresh={load} canExecute={executor}/>}
    <div className="facility-panel"><h3>{t('technicalRecord')}</h3><div className="form-grid">{[['diagnosis','diagnosis'],['root_cause','rootCause'],['work_performed','workPerformed'],['tests_performed','testsPerformed'],['recommendations','recommendations']].map(([key,label])=><Field label={t(label)} key={key} wide><textarea value={form[key]} onChange={e=>set(key,e.target.value)} disabled={!executor||row.status!=='in_progress'}/></Field>)}</div>{button('complete',executor&&row.status==='in_progress',{diagnosis:form.diagnosis,root_cause:form.root_cause,work_performed:form.work_performed,tests_performed:form.tests_performed,recommendations:form.recommendations},true)}<p className="muted">{t('previewOnly')}</p></div>
    {(executor||manager)&&!['closed','cancelled'].includes(row.status)&&<div className="facility-panel"><h3>{t('internalNote')}</h3><Field label={t('note')}><textarea value={form.text} onChange={e=>set('text',e.target.value)}/></Field>{button('note',!!form.text.trim()&&['assigned','accepted','in_progress','on_hold'].includes(row.status),{text:form.text})}</div>}
   </>}
   <div className="facility-panel"><h3>{t('history')}</h3>{history.length?history.map(e=><div key={e.id} className="facility-history-item" style={{padding:'12px 0',borderBottom:'1px solid var(--border, #ddd)'}}><strong>{t(e.action)}</strong> · {e.from_status?t(e.from_status)+' → ':''}{t(e.to_status||'')}<p className="muted">{new Date(e.created_at).toLocaleString(lang)} · {data?.staff.find(x=>x.id===e.actor_id)?.full_name||e.actor_id}</p>{e.details?.reason&&<p>{e.details.reason}</p>}{e.details?.text&&<p>{e.details.text}</p>}</div>):<p>{t('noData')}</p>}</div>
  </>}
 </section>
}
