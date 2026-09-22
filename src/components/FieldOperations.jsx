import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {Field,Select,Notice,Status} from './FacilityFields'
import {loadField,fieldAction,uploadEvidence,openEvidence,enableField,localDateTime} from '../lib/fieldOperations'

const emptyVisit={diagnosis:'',work_performed:'',tests_performed:'',notes:''}
export default function FieldOperations({workOrder,onRefresh,canExecute=false}){
 const {can,user}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [form,setForm]=useState(emptyVisit),[labor,setLabor]=useState({started_at:'',ended_at:'',activity:''})
 const [reason,setReason]=useState(''),[file,setFile]=useState(null),[caption,setCaption]=useState(''),[requireEvidence,setRequireEvidence]=useState(true)
 const [tab,setTab]=useState('visits')
 const wo=workOrder?.id
 const manager=can('corrective.manage',workOrder?.organization_id)
 const executor=canExecute
 const [ownVisit,setOwnVisit]=useState(null)
 const load=async()=>{
  if(!wo)return
  try{
   const result=await loadField(wo)
   setData(result);setError('')
   const current=result.visits.find(v=>v.status==='open'&&v.technician_id===user?.id)||null
   setOwnVisit(current)
   if(current)setLabor(old=>old.started_at?old:{...old,started_at:localDateTime(current.started_at),ended_at:localDateTime(new Date())})
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[wo])
 const run=async(command,id=null,payload={})=>{
  if(busy)return
  if(['finish_visit','cancel_visit','enable'].includes(command)&&!confirm(t('confirmAction')))return
  setBusy(true);setError('');setSuccess('')
  try{
   if(command==='enable')await enableField(wo,requireEvidence)
   else await fieldAction(command,wo,id,payload)
   await load();setSuccess(t('saved'))
   if(command==='finish_visit')setForm(emptyVisit)
   if(command==='labor')setLabor({started_at:'',ended_at:'',activity:''})
   if(command==='cancel_visit')setReason('')
   onRefresh?.()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 const upload=async e=>{
  e.preventDefault();if(!file||!ownVisit)return
  setBusy(true);setError('');setSuccess('')
  try{await uploadEvidence(wo,ownVisit.id,file,caption);setFile(null);setCaption('');await load();setSuccess(t('saved'))}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const openFile=async id=>{
  try{
   const url=await openEvidence(id)
   window.open(url,'_blank','noopener,noreferrer')
  }catch(e){setError(e.message)}
 }
 const localDate=value=>value?new Date(value).toLocaleString(lang):'—'
 const allowed=executor&&['accepted','in_progress'].includes(workOrder.status)
 return <div className="facility-panel">
  <div className="page-head"><h2>{t('fieldOperations')}</h2><button type="button" className="btn secondary" onClick={load}>{t('refresh')}</button></div>
  <Notice error={error} success={success}/>
  <p className="muted">{t('fieldNotice')}</p>
  <div className="row-actions">
   {[['visits','fieldVisits'],['labor','fieldLabor'],['evidence','fieldEvidence']].map(([key,label])=><button type="button" key={key} className={'btn '+(tab===key?'primary':'secondary')} onClick={()=>setTab(key)}>{t(label)}</button>)}
  </div>
  {manager&&!data?.requirements&&!['completed','approved','closed','cancelled'].includes(workOrder.status)&&<div className="facility-panel">
   <h3>{t('fieldControls')}</h3><p className="muted">{t('fieldGateNotice')}</p>
   <label><input type="checkbox" checked={requireEvidence} onChange={e=>setRequireEvidence(e.target.checked)}/> {t('requireEvidence')}</label>
   <div className="row-actions"><button type="button" className="btn secondary" disabled={busy} onClick={()=>run('enable')}>{t('enableField')}</button></div>
  </div>}
  {data?.requirements&&<p className="muted">{t('fieldGateNotice')}</p>}
  {tab==='visits'&&<>
   {allowed&&!ownVisit&&<button type="button" className="btn primary" disabled={busy} onClick={()=>run('start_visit')}>{t('startVisit')}</button>}
   {ownVisit&&<div className="facility-panel">
    <h3>{t('visitNumber')}: {ownVisit.visit_number}</h3>
    <p>{t('startedAt')}: {localDate(ownVisit.started_at)}</p>
    <div className="form-grid">
     {['diagnosis','work_performed','tests_performed','notes'].map(key=><Field key={key} label={t(({work_performed:'workPerformed',tests_performed:'testsPerformed'})[key]||key)} wide><textarea value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}/></Field>)}
    </div>
    <div className="row-actions"><button type="button" className="btn primary" disabled={busy||form.work_performed.trim().length<5} onClick={()=>run('finish_visit',ownVisit.id,form)}>{t('finishVisit')}</button></div>
    <Field label={t('reason')}><textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field>
    <button type="button" className="btn secondary" disabled={busy||reason.trim().length<5} onClick={()=>run('cancel_visit',ownVisit.id,{reason})}>{t('cancelVisit')}</button>
   </div>}
   {data?.visits.map(v=><div className="facility-panel" key={v.id} style={{marginBlock:'12px'}}>
    <div className="row-actions"><strong>{v.visit_number}</strong><Status value={v.status}/></div>
    <p>{t('technician')}: {v.technician_id}</p>
    <p>{t('startedAt')}: {localDate(v.started_at)} · {t('finishedAt')}: {localDate(v.finished_at)}</p>
    {v.diagnosis&&<p><strong>{t('diagnosis')}:</strong> {v.diagnosis}</p>}
    {v.work_performed&&<p><strong>{t('workPerformed')}:</strong> {v.work_performed}</p>}
    {v.tests_performed&&<p><strong>{t('testsPerformed')}:</strong> {v.tests_performed}</p>}
    {v.notes&&<p>{v.notes}</p>}
   </div>)}
  </>}
  {tab==='labor'&&<>
   <p className="muted">{t('laborNotice')}</p>
   {ownVisit&&<form className="facility-form" onSubmit={e=>{e.preventDefault();run('labor',ownVisit.id,{...labor,started_at:new Date(labor.started_at).toISOString(),ended_at:new Date(labor.ended_at).toISOString()})}}>
    <div className="form-grid">
     <Field label={t('startedAt')} required><input type="datetime-local" step="1" required value={labor.started_at} onChange={e=>setLabor(f=>({...f,started_at:e.target.value}))}/></Field>
     <Field label={t('endedAt')} required><input type="datetime-local" step="1" required value={labor.ended_at} onChange={e=>setLabor(f=>({...f,ended_at:e.target.value}))}/></Field>
     <Field label={t('activity')} required wide><textarea required minLength={5} value={labor.activity} onChange={e=>setLabor(f=>({...f,activity:e.target.value}))}/></Field>
    </div><button className="btn primary" disabled={busy}>{t('recordLabor')}</button>
   </form>}
   <div className="facility-panel"><strong>{t('duration')}: {(data?.labor.reduce((n,l)=>n+Number(l.minutes||0),0)||0)} {t('minutes')}</strong></div>
   {data?.labor.map(l=><div className="facility-panel" key={l.id} style={{marginBlock:'8px'}}>
    <div className="row-actions"><strong>{l.activity}</strong><span>{l.minutes} {t('minutes')}</span></div>
    <p>{localDate(l.started_at)} — {localDate(l.ended_at)}</p><p className="muted">{l.technician_id}</p>
   </div>)}
  </>}
  {tab==='evidence'&&<>
   <p className="muted">{t('evidenceNotice')}</p>
   {ownVisit&&<form className="facility-form" onSubmit={upload}>
    <Field label={t('file')} required><input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" required onChange={e=>setFile(e.target.files?.[0]||null)}/></Field>
    <Field label={t('caption')}><input value={caption} onChange={e=>setCaption(e.target.value)}/></Field>
    <button className="btn primary" disabled={busy||!file}>{t('uploadEvidence')}</button>
   </form>}
   {data?.evidence.map(e=><div className="facility-panel" key={e.id} style={{marginBlock:'8px'}}>
    <div className="row-actions"><strong>{e.file_name}</strong><Status value={e.status}/></div>
    <p>{e.caption}</p><p className="muted">{localDate(e.created_at)} · {e.uploaded_by}</p>
    {e.status==='ready'&&<button type="button" className="btn secondary" onClick={()=>openFile(e.id)}>{t('openEvidence')}</button>}
   </div>)}
  </>}
  <div className="facility-panel">
   <h3>{t('fieldMaterials')}</h3><p className="muted">{t('materialsNotice')}</p>
   {data?.materials.map(m=><div className="row-actions" key={m.part_id+'-'+(m.owner_client_id||'company')} style={{padding:'8px 0'}}>
    <strong>{m.sku}</strong><span>{m.owner_client_id?m.owner_client_id:t('companyStock')}</span>
    <span>{Number(m.consumed_quantity).toLocaleString(undefined,{maximumFractionDigits:3})} {m.unit}</span>
   </div>)}
   {!data?.materials.length&&<p>{t('noData')}</p>}
   <Link to="/advanced-stock">{t('advancedStock')}</Link>
  </div>
 </div>
}
