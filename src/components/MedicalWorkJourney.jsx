import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {loadApprovalPortal,approvalAction} from '../lib/approvals'
import {loadDocuments,generateDocument} from '../lib/documents'
import {latestOwnerApproval,journeyState} from '../lib/medicalJourney'
import {useLanguage} from '../i18n/LanguageContext'
import './MedicalWorkJourney.css'

const labels={ar:['أمر العمل','إسناد الفني','تقرير التنفيذ','اعتماد المشرف','قبول المالك','شهادة الإنجاز','الإغلاق'],en:['Work order','Technician assignment','Execution report','Supervisor approval','Owner acceptance','Completion certificate','Closeout']}
const statuses={ar:{draft:'مسودة',scheduled:'مجدولة',assigned:'مسندة',accepted:'مقبولة',in_progress:'قيد التنفيذ',on_hold:'معلقة',completed:'بانتظار المراجعة',approved:'معتمدة',closed:'مغلقة',cancelled:'ملغاة'},en:{draft:'Draft',scheduled:'Scheduled',assigned:'Assigned',accepted:'Accepted',in_progress:'In progress',on_hold:'On hold',completed:'Awaiting review',approved:'Approved',closed:'Closed',cancelled:'Cancelled'}}

export default function MedicalWorkJourney({asset,jobs=[],workOrders=[],onRefresh}){
 const {lang}=useLanguage(),ar=lang==='ar',l=(a,e)=>ar?a:e
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
 // PPM jobs have their own review/approval identity, even when linked to a WO.
 const records=[...jobs.map(r=>({...r,entityType:'ppm_job',href:`/ppm/job/${r.id}`,reference:r.job_number,kind:l('وقائية','Preventive')})),...workOrders.map(r=>({...r,entityType:'work_order',href:`/corrective/work_order/${r.id}`,reference:r.work_order_number,kind:l('أمر عمل','Work order')}))]
 return <div className="medical-journey" aria-busy={busy}>
  <div className="medical-journey-heading"><div><span className="medical-eyebrow">{l('دورة تشغيل الجهاز','DEVICE SERVICE JOURNEY')}</span><h2>{l('من أمر العمل إلى شهادة الإنجاز','From work order to completion certificate')}</h2><p>{l('لكل عملية صيانة سجل مستقل للتنفيذ والمراجعة وقبول المالك والشهادة.','Each maintenance record keeps its own execution, review, owner acceptance and certificate.')}</p></div><button className="btn" disabled={busy} onClick={()=>{setBundle(null);setError('');setRevision(n=>n+1)}}>{l('تحديث الاعتمادات','Refresh approvals')}</button></div>
  {error&&<p className="alert error" role="alert">{error}</p>}
  {!bundle&&!error&&<p role="status">{l('جارٍ تحميل الاعتمادات والمستندات…','Loading approvals and documents…')}</p>}
  {!records.length&&<div className="medical-journey-empty">{l('ابدأ بإنشاء خطة صيانة وقائية أو تسجيل بلاغ عطل من أزرار الجهاز.','Start with a preventive maintenance plan or a fault request using the device actions.')}</div>}
  {records.map(r=>{
   const owner=latestOwnerApproval(bundle?.approvals||[],r.entityType,r.id)
   const state=journeyState(r,owner,bundle?.documents||[])
   const entity=bundle?.entities.find(e=>e.entity_type===r.entityType&&e.entity_id===r.id)
   const scope=bundle?.clients.find(c=>c.organization_id===r.organization_id&&c.client_id===r.client_id)
   const report=bundle?.eligible.find(e=>e.document_type==='technical_report'&&e.entity_type===r.entityType&&e.entity_id===r.id)
   const cert=bundle?.eligible.find(e=>e.document_type==='approval_certificate'&&e.entity_type==='approval'&&e.entity_id===owner?.id)
   const docs=(bundle?.documents||[]).filter(d=>(d.entity_type===r.entityType&&d.entity_id===r.id)||(d.entity_type==='approval'&&d.entity_id===owner?.id))
   const next=state.cancelled?l('ملغاة','Cancelled'):state.next===-1?l('اكتملت دورة الإنجاز','Completion journey finished'):labels[lang==='ar'?'ar':'en'][state.next]
   return <article className="medical-journey-card" key={`${r.entityType}-${r.id}`}>
    <div className="medical-journey-heading"><div><span className="medical-eyebrow">{r.kind}</span><h3><Link to={r.href}>{r.reference||l('فتح سجل الصيانة','Open maintenance record')}</Link></h3><p>{r.title||asset.asset_tag}</p></div><span className="medical-state">{statuses[ar?'ar':'en'][r.status]||l('حالة غير معروفة','Unknown status')}</span></div>
    <ol className="medical-steps" aria-label={l('مراحل الإنجاز','Completion stages')}>{labels[ar?'ar':'en'].map((label,i)=><li key={label} className={state.steps[i]?'done':state.next===i?'current':''} aria-current={state.next===i?'step':undefined}><span>{state.steps[i]?'✓':i+1}</span>{label}</li>)}</ol>
    <p><strong>{l('المرحلة التالية: ','Next stage: ')}</strong>{next}</p>
    {owner&&<p>{l('قبول المالك: ','Owner acceptance: ')}{owner.status==='approved'?l('معتمد','Approved'):owner.status==='rejected'?l('معاد للاستكمال','Returned for rework'):owner.status==='cancelled'?l('ملغى','Cancelled'):l('بانتظار المراجعة','Pending review')}{owner.decided_at?` · ${new Date(owner.decided_at).toLocaleString(ar?'ar-SA':'en-GB')}`:''}</p>}
    <div className="row-actions">
     <Link className="btn primary" to={r.href}>{l('فتح التنفيذ والمراجعة','Open execution and review')}</Link>
     {bundle&&!state.cancelled&&report&&<button className="btn" disabled={busy} onClick={()=>run(()=>generateDocument('technical_report',r.entityType,r.id))}>{l('إصدار تقرير التنفيذ','Generate execution report')}</button>}
     {bundle&&state.steps[3]&&entity&&scope?.can_request&&!['pending','approved'].includes(owner?.status)&&<button className="btn" disabled={busy} onClick={()=>run(()=>approvalAction('create',null,{organization_id:r.organization_id,client_id:r.client_id,site_id:r.site_id,entity_type:r.entityType,entity_id:r.id,reviewer_type:'owner',subject:`${l('قبول إنجاز صيانة','Maintenance completion acceptance')} — ${r.reference||asset.asset_tag}`,request_comment:'',due_at:''}))}>{l('إرسال لقبول المالك','Request owner acceptance')}</button>}
     {bundle&&state.steps[4]&&cert&&!state.certificate&&<button className="btn primary" disabled={busy} onClick={()=>run(()=>generateDocument('approval_certificate','approval',owner.id))}>{l('إصدار شهادة اعتماد الإنجاز','Generate completion approval certificate')}</button>}
     {owner?.status==='pending'&&<Link className="btn" to={`/approvals?entity=${r.id}`}>{l('مراجعة طلب القبول','Review acceptance request')}</Link>}
     {docs.length>0&&<Link className="btn" to={`/documents?entity=${r.id}&approval=${owner?.id||''}`}>{l('عرض التقارير والشهادات','View reports and certificates')} ({docs.length})</Link>}
    </div>
   </article>
  })}
 </div>
}
