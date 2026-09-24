import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {Field,Select,Notice,Status} from '../components/FacilityFields'
import {loadApprovalPortal,approvalAction,findConsultant,manageConsultant} from '../lib/approvals'

const blankRequest={entity_id:'',reviewer_type:'owner',subject:'',request_comment:'',due_at:''}
export default function ApprovalPortal(){
 const {t,lang}=useLanguage()
 const [data,setData]=useState(null),[filters,setFilters]=useState({organization_id:'',client_id:'',status:''})
 const [form,setForm]=useState(blankRequest),[decision,setDecision]=useState({}),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [email,setEmail]=useState(''),[found,setFound]=useState(null)
 const load=async(next=filters)=>{
  setBusy(true);setError('')
  try{
   const result=await loadApprovalPortal(next)
   setData(result)
   const first=result.clients?.[0]
   if(first&&!next.organization_id){
    const scoped={...next,organization_id:first.organization_id,client_id:first.client_id}
    setFilters(scoped)
    const scopedResult=await loadApprovalPortal(scoped)
    setData(scopedResult)
   }
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{load({organization_id:'',client_id:'',status:''})},[])
 const clients=data?.clients||[]
 const selected=clients.find(c=>c.organization_id===filters.organization_id&&c.client_id===filters.client_id)||clients[0]
 const entities=(data?.entities||[]).filter(e=>(!selected||e.organization_id===selected.organization_id&&e.client_id===selected.client_id))
 const requests=data?.approvals||[]
 const roleLabel=role=>t(role==='staff'?'approvalRoleStaff':role==='owner'?'approvalRoleOwner':'approvalRoleConsultant')
 const statusLabel=status=>t(status==='pending'?'approvalPending':status==='approved'?'approvalApproved':status==='rejected'?'approvalRejected':'approvalCancelled')
 const setFilter=(key,value)=>{
  const next={...filters,[key]:value}
  if(key==='organization_id')next.client_id=''
  setFilters(next)
 }
 const apply=e=>{e.preventDefault();load(filters)}
 const create=async e=>{
  e.preventDefault()
  if(!selected||!form.entity_id)return
  const entity=entities.find(x=>x.entity_id===form.entity_id)
  if(!entity)return
  setBusy(true);setError('');setSuccess('')
  try{
   await approvalAction('create',null,{
    organization_id:entity.organization_id,client_id:entity.client_id,site_id:entity.site_id,
    entity_type:entity.entity_type,entity_id:entity.entity_id,reviewer_type:form.reviewer_type,
    subject:form.subject,request_comment:form.request_comment,
    due_at:form.due_at?new Date(form.due_at).toISOString():''
   })
   setForm(blankRequest);setSuccess(t('approvalRequestCreated'));await load(filters)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const decide=async(row,action)=>{
  const comment=(decision[row.id]||'').trim()
  if((action==='reject'||action==='cancel')&&comment.length<5){setError(t('approvalReasonRequired'));return}
  if(!confirm(t('confirmAction')))return
  setBusy(true);setError('');setSuccess('')
  try{
   await approvalAction(action,row.id,{comment})
   setDecision(d=>({...d,[row.id]:''}));setSuccess(t('approvalDecisionSaved'));await load(filters)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const lookup=async e=>{
  e.preventDefault();if(!selected||!email.trim())return
  setBusy(true);setError('');setFound(null)
  try{
   const user=await findConsultant(email,selected.organization_id)
   setFound(user||false)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const grant=async action=>{
  if(!found||!selected)return
  setBusy(true);setError('');setSuccess('')
  try{
   await manageConsultant(action,found.id,selected.organization_id,selected.client_id)
   setSuccess(t('approvalAccessSaved'));await load(filters)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const clientOptions=clients.map(c=>({value:`${c.organization_id}|${c.client_id}`,label:`${c.client_name} — ${roleLabel(c.role)}`}))
 const currentKey=selected?`${selected.organization_id}|${selected.client_id}`:''
 const chooseClient=value=>{
  const [organization_id,client_id]=value.split('|')
  const next={...filters,organization_id,client_id}
  setFilters(next);load(next)
 }
 const entityOptions=[{value:'',label:t('approvalSelect')},...entities.map(e=>({value:e.entity_id,label:`${e.entity_number} — ${e.entity_title}`}))]
 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('approvals')}</h1><p className="muted">{t('approvalExternalOnly')}</p></div><button className="btn secondary" onClick={()=>load(filters)} disabled={busy}>{t('approvalRefresh')}</button></div>
  <Notice error={error} success={success}/>
  {!clients.length&&!busy?<div className="facility-panel"><p>{t('approvalNoAccess')}</p></div>:<>
   <div className="facility-panel">
    <div className="form-grid">
     <Field label={t('approvalClient')}><Select value={currentKey} onChange={chooseClient} options={clientOptions}/></Field>
     <Field label={t('approvalStatus')}><Select value={filters.status} onChange={v=>setFilter('status',v)} options={[
      {value:'',label:t('approvalAll')},{value:'pending',label:t('approvalPending')},{value:'approved',label:t('approvalApproved')},{value:'rejected',label:t('approvalRejected')},{value:'cancelled',label:t('approvalCancelled')}
     ]}/></Field>
    </div>
   </div>

   {selected?.can_request&&<form className="facility-panel" onSubmit={create}>
    <h2>{t('approvalCreate')}</h2><p className="muted">{t('approvalEntityState')}</p>
    <div className="form-grid">
     <Field label={t('approvalEntity')} required><Select required value={form.entity_id} onChange={v=>setForm(f=>({...f,entity_id:v}))} options={entityOptions}/></Field>
     <Field label={t('approvalReviewer')} required><Select value={form.reviewer_type} onChange={v=>setForm(f=>({...f,reviewer_type:v}))} options={[
      {value:'owner',label:t('approvalOwner')},{value:'consultant',label:t('approvalConsultant')}
     ]}/></Field>
     <Field label={t('approvalSubject')} required><input required minLength={3} maxLength={250} value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}/></Field>
     <Field label={t('approvalDue')}><input type="datetime-local" value={form.due_at} onChange={e=>setForm(f=>({...f,due_at:e.target.value}))}/></Field>
     <Field label={t('approvalRequestComment')} wide><textarea maxLength={4000} value={form.request_comment} onChange={e=>setForm(f=>({...f,request_comment:e.target.value}))}/></Field>
    </div>
    <button className="btn primary" disabled={busy||!form.entity_id}>{t('approvalCreate')}</button>
   </form>}

   {selected?.can_consultants&&<form className="facility-panel" onSubmit={lookup}>
    <h2>{t('approvalConsultantAccess')}</h2>
    <div className="form-grid">
     <Field label={t('approvalConsultantEmail')} required><input type="email" required value={email} onChange={e=>{setEmail(e.target.value);setFound(null)}}/></Field>
    </div>
    <button className="btn secondary" disabled={busy}>{t('approvalFindUser')}</button>
    {found===false&&<p>{t('approvalUserNotFound')}</p>}
    {found&&<div className="facility-panel"><strong>{found.full_name||found.email}</strong><p className="muted">{found.email}</p>
     <div className="row-actions"><button type="button" className="btn primary" onClick={()=>grant('grant')} disabled={busy}>{t('approvalGrantAccess')}</button><button type="button" className="btn secondary" onClick={()=>grant('revoke')} disabled={busy}>{t('approvalRevokeAccess')}</button></div>
    </div>}
   </form>}

   <div className="facility-panel">
    <h2>{t('approvalRequests')}</h2>
    <p className="muted">{t('approvalIndependent')}</p><p className="muted">{t('approvalCloseGate')}</p>
    {!requests.length?<p>{t('approvalNoData')}</p>:requests.map(row=>{
     const canDecide=row.status==='pending'&&((row.reviewer_type==='owner'&&selected?.role==='owner')||(row.reviewer_type==='consultant'&&selected?.role==='consultant'))
     return <article key={row.id} className="facility-panel" style={{marginBlock:'12px'}}>
      <div className="page-head"><div><strong>{row.entity_number} — {row.subject}</strong><p className="muted">{row.entity_title}</p></div><Status value={row.status}/></div>
      <div className="form-grid">
       <div><span className="muted">{t('approvalReviewer')}</span><p>{row.reviewer_type==='owner'?t('approvalOwner'):t('approvalConsultant')}</p></div>
       <div><span className="muted">{t('approvalRound')}</span><p>{row.round}</p></div>
       <div><span className="muted">{t('approvalRequestedAt')}</span><p>{new Date(row.requested_at).toLocaleString(lang)}</p></div>
       <div><span className="muted">{t('approvalDue')}</span><p>{row.due_at?new Date(row.due_at).toLocaleString(lang):'—'}</p></div>
      </div>
      {row.request_comment&&<p>{row.request_comment}</p>}
      {row.decision_comment&&<p><strong>{t('approvalDecisionComment')}:</strong> {row.decision_comment}</p>}
      {row.status==='pending'&&(canDecide||selected?.can_manage)&&<Field label={t('approvalDecisionComment')}><textarea value={decision[row.id]||''} onChange={e=>setDecision(d=>({...d,[row.id]:e.target.value}))}/></Field>}
      <div className="row-actions">
       {canDecide&&<><button className="btn primary" type="button" disabled={busy} onClick={()=>decide(row,'approve')}>{t('approvalApprove')}</button><button className="btn secondary" type="button" disabled={busy} onClick={()=>decide(row,'reject')}>{t('approvalReject')}</button></>}
       {selected?.can_manage&&row.status==='pending'&&<button className="btn secondary" type="button" disabled={busy} onClick={()=>decide(row,'cancel')}>{t('approvalCancel')}</button>}
      </div>
     </article>
    })}
   </div>
  </>}
 </section>
}
