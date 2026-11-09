import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {action} from '../lib/corrective'
import {ppmAction} from '../lib/ppm'
import {finishMedicalJourney} from '../lib/medicalJourney'
import {loadApprovalPortal,approvalAction} from '../lib/approvals'
import {loadDocuments,generateDocument} from '../lib/documents'
import {latestOwnerApproval,journeyState} from '../lib/medicalJourney'
import {useLanguage} from '../i18n/LanguageContext'
import './MedicalWorkJourney.css'

const detailedLabels={ar:['أمر العمل','إسناد الفني','تقرير التنفيذ','اعتماد المشرف','قبول المالك','شهادة الإنجاز','الإغلاق'],en:['Work order','Technician assignment','Execution report','Supervisor approval','Owner acceptance','Completion certificate','Closeout']}
const statuses={ar:{draft:'مسودة',scheduled:'مجدولة',assigned:'مسندة',accepted:'مقبولة',in_progress:'قيد التنفيذ',on_hold:'معلقة',completed:'بانتظار المراجعة',approved:'معتمدة',closed:'مغلقة',cancelled:'ملغاة'},en:{draft:'Draft',scheduled:'Scheduled',assigned:'Assigned',accepted:'Accepted',in_progress:'In progress',on_hold:'On hold',completed:'Awaiting review',approved:'Approved',closed:'Closed',cancelled:'Cancelled'}}

export default function MedicalWorkJourney({asset,jobs=[],workOrders=[],onRefresh}){
 const {lang}=useLanguage(),ar=lang==='ar',l=(a,e)=>ar?a:e
 const {can}=useAuth()
 const labels=ar?['تنفيذ الصيانة','المراجعة وقبول المالك','الشهادة والإغلاق']:['Perform maintenance','Review and owner acceptance','Certificate and closeout']
 const [showHistory,setShowHistory]=useState(false)
 const [bundle,setBundle]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0)
 useEffect(()=>{
  let active=true
  async function load(){
   try{
    const filters={organization_id:asset.organization_id,client_id:asset.client_id,limit:200}
    const approvals=[],entities=[],clients=[],documents=[],eligible=[]
    // Both centers are paginated. Missing rows must never imply missing approval.
    for(let offset=0;;offset+=200){
     const p=await loadApprovalPortal({...filters,offset})
     approvals.push(...(p.approvals||[]));entities.push(...(p.entities||[]));clients.push(...(p.clients||[]))
     if((p.approvals||[]).length<200)break
    }
    for(let offset=0;;offset+=200){
     const d=await loadDocuments({...filters,offset})
     documents.push(...(d.documents||[]));eligible.push(...(d.eligible||[]))
     if((d.documents||[]).length<200)break
    }
    if(active){setBundle({approvals,entities,clients,documents,eligible});setError('')}
   }catch(e){if(active)setError(e.message)}
  }
  load();return()=>{active=false}
 },[asset.asset_id,asset.organization_id,asset.client_id,revision])
 const run=async(fn)=>{
  if(busy)return
  setBusy(true);setError('')
  try{await fn();setBundle(null);setRevision(n=>n+1);await onRefresh?.()}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const sendToOwner=async(r,report)=>{
  // Re-read after a failed approval request so retrying reuses its final report.
  let existing=false
  if(report)for(let offset=0;;offset+=200){
   const page=await loadDocuments({organization_id:r.organization_id,client_id:r.client_id,limit:200,offset})
   existing=(page.documents||[]).some(d=>d.entity_type===r.entityType&&d.entity_id===r.id&&d.document_type==='technical_report'&&d.status==='final')
   if(existing||(page.documents||[]).length<200)break
  }
  const training=String(asset.serial_number||'').startsWith('TEST-')
  if(report&&!existing)await generateDocument('technical_report',r.entityType,r.id,training?`TEST ONLY — Technical Report — ${r.reference||asset.asset_tag}`:'')
  await approvalAction('create',null,{organization_id:r.organization_id,client_id:r.client_id,site_id:r.site_id,entity_type:r.entityType,entity_id:r.id,reviewer_type:'owner',subject:`${training?'TEST ONLY — ':''}${l('قبول إنجاز الصيانة','Maintenance completion acceptance')} — ${r.reference||asset.asset_tag}`,request_comment:training?'TEST ONLY — virtual training workflow; no actual clinical maintenance or release.':'',due_at:''})
 }
 const finish=(r,owner)=>finishMedicalJourney({record:r,owner,
  read:async()=>{const documents=[],eligible=[];for(let offset=0;;offset+=200){const d=await loadDocuments({organization_id:r.organization_id,client_id:r.client_id,limit:200,offset});documents.push(...(d.documents||[]));eligible.push(...(d.eligible||[]));if(!d.has_more)break}return {documents,eligible}},
  generate:()=>generateDocument('approval_certificate','approval',owner.id),
  close:()=>r.entityType==='ppm_job'?ppmAction('job',r.id,'close'):action('work_order',r.id,'close')
 })
 // PPM jobs have their own review/approval identity, even when linked to a WO.
 const linkedWorkOrders=new Set(jobs.map(j=>j.work_order_id).filter(Boolean))
 const records=[...jobs.map(r=>({...r,entityType:'ppm_job',href:`/ppm/job/${r.id}`,reference:r.job_number,kind:l('وقائية','Preventive')})),...workOrders.filter(r=>!linkedWorkOrders.has(r.id)).map(r=>({...r,entityType:'work_order',href:`/corrective/work_order/${r.id}`,reference:r.work_order_number,kind:l('أمر عمل','Work order')}))]
 return <div className="medical-journey" aria-busy={busy}>
  <div className="medical-journey-heading"><div><span className="medical-eyebrow">{l('دورة تشغيل الجهاز','DEVICE SERVICE JOURNEY')}</span><h2>{l('الصيانة في ثلاث خطوات','Maintenance in three steps')}</h2><p>{l('نفّذ الصيانة، راجع الإنجاز، ثم أصدر الشهادة وأغلق العمل.','Perform the work, review completion, then issue the certificate and close.')}</p></div><button className="btn" disabled={busy} onClick={()=>{setBundle(null);setError('');setRevision(n=>n+1)}}>{l('تحديث الاعتمادات','Refresh approvals')}</button></div>
  {error&&<p className="alert error" role="alert">{error}</p>}
  {!bundle&&!error&&<p role="status">{l('جارٍ تحميل الاعتمادات والمستندات…','Loading approvals and documents…')}</p>}
  {!records.length&&<div className="medical-journey-empty">{l('ابدأ بإنشاء خطة صيانة وقائية أو تسجيل بلاغ عطل من أزرار الجهاز.','Start with a preventive maintenance plan or a fault request using the device actions.')}</div>}
  <label className="medical-history-toggle"><input type="checkbox" checked={showHistory} onChange={e=>setShowHistory(e.target.checked)}/>{l('إظهار الأعمال المغلقة والملغاة','Show closed and cancelled work')}</label>
  {!showHistory&&records.length>0&&records.every(r=>['closed','cancelled'].includes(r.status))&&<p>{l('لا توجد أعمال مفتوحة. السجل متاح من الخيار أعلاه.','No open work. Use the option above to view history.')}</p>}
  {records.filter(r=>showHistory||!['closed','cancelled'].includes(r.status)).map(r=>{
   const owner=latestOwnerApproval(bundle?.approvals||[],r.entityType,r.id)
   const state=journeyState(r,owner,bundle?.documents||[])
   const entity=bundle?.entities.find(e=>e.entity_type===r.entityType&&e.entity_id===r.id)
   const scope=bundle?.clients.find(c=>c.organization_id===r.organization_id&&c.client_id===r.client_id)
   const report=bundle?.eligible.find(e=>e.document_type==='technical_report'&&e.entity_type===r.entityType&&e.entity_id===r.id)
   const docs=(bundle?.documents||[]).filter(d=>(d.entity_type===r.entityType&&d.entity_id===r.id)||(d.entity_type==='approval'&&d.entity_id===owner?.id))
   const next=state.cancelled?l('ملغاة','Cancelled'):state.next===-1?l('اكتملت دورة الإنجاز','Completion journey finished'):detailedLabels[ar?'ar':'en'][state.next]
   const compact=[state.steps[2],state.steps[4],state.steps[6]]
   const current=compact.findIndex(v=>!v)
   const canFinish=can(r.entityType==='ppm_job'?'ppm.approve':'corrective.approve',r.organization_id)
   const canDecide=owner?.status==='pending'&&scope?.role==='owner'
   const canSend=state.steps[3]&&entity&&scope?.can_request&&!['pending','approved'].includes(owner?.status)
   return <article className="medical-journey-card" key={`${r.entityType}-${r.id}`}>
    <div className="medical-journey-heading"><div><span className="medical-eyebrow">{r.kind}</span><h3><Link to={r.href}>{r.reference||l('فتح سجل الصيانة','Open maintenance record')}</Link></h3><p>{r.title||asset.asset_tag}</p></div><span className="medical-state">{statuses[ar?'ar':'en'][r.status]||l('حالة غير معروفة','Unknown status')}</span></div>
    <ol className="medical-steps medical-steps-simple" aria-label={l('مراحل الإنجاز','Completion stages')}>{labels.map((label,i)=><li key={label} className={compact[i]?'done':current===i?'current':''} aria-current={current===i?'step':undefined}><span>{compact[i]?'✓':i+1}</span>{label}</li>)}</ol>
    <p><strong>{l('المرحلة التالية: ','Next stage: ')}</strong>{next}</p>
    {owner&&<p>{l('قبول المالك: ','Owner acceptance: ')}{owner.status==='approved'?l('معتمد','Approved'):owner.status==='rejected'?l('معاد للاستكمال','Returned for rework'):owner.status==='cancelled'?l('ملغى','Cancelled'):l('بانتظار المراجعة','Pending review')}{owner.decided_at?` · ${new Date(owner.decided_at).toLocaleString(ar?'ar-SA':'en-GB')}`:''}</p>}
    <div className="row-actions">
     {!state.cancelled&&bundle&&(canSend?<button className="btn primary" disabled={busy} onClick={()=>run(()=>sendToOwner(r,report))}>{l('تجهيز التقرير وإرسال للمالك','Prepare report and send to owner')}</button>
      :canDecide?<button className="btn primary" disabled={busy} onClick={()=>run(()=>approvalAction('approve',owner.id,{comment:''}))}>{l('قبول الإنجاز','Accept completed work')}</button>
      :state.steps[4]&&!state.steps[6]&&canFinish?<button className="btn primary" disabled={busy} onClick={()=>run(()=>finish(r,owner))}>{l('إصدار الشهادة وإغلاق الصيانة','Issue certificate and close maintenance')}</button>
      :!state.steps[3]?<Link className="btn primary" to={r.href}>{r.status==='completed'?l('مراجعة الإنجاز','Review completed work'):r.status==='draft'||r.status==='scheduled'?l('إسناد الفني','Assign technician'):l('متابعة التنفيذ','Continue maintenance')}</Link>
      :owner?.status==='pending'?<p role="status">{l('بانتظار قبول المالك','Waiting for owner acceptance')}</p>:null)}
    </div>
    <details className="medical-more"><summary>{l('التفاصيل والمستندات','Details and documents')}</summary><div className="row-actions"><Link className="btn" to={r.href}>{l('سجل التنفيذ والمراجعة','Execution and review record')}</Link>{owner&&<Link className="btn" to={`/approvals?entity=${r.id}`}>{l('تفاصيل الاعتماد أو الإعادة','Approval or rework details')}</Link>}{docs.length>0&&<Link className="btn" to={`/documents?entity=${r.id}&approval=${owner?.id||''}`}>{l('التقارير والشهادات','Reports and certificates')} ({docs.length})</Link>}</div></details>
   </article>
  })}
 </div>
}
