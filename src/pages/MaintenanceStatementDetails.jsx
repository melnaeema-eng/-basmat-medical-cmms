import StatementMeasurements,{StatementMeasurementTable,StatementCostEvidence} from '../components/StatementMeasurements'
import {NextActionCard} from '../components/MaintenanceFocus'
import {statementNextAction} from '../lib/cycleProgress'
import {formatCycleMoney} from '../lib/cycleMoney'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {useEffect,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {readStatement,statementAction,cycleRpc} from '../lib/maintenanceCycle'
import {CycleField,CycleError,CycleStatus,useCycleLanguage} from '../components/CycleFields'
import {readStatementCertificates,registerStatementCertificate} from '../lib/statementCertificates'
import '../cycle.css'
const blank={certificate_id:'',coverage:'included',labor:'0',parts:'0',plant:'0',other:'0',basis:''}
export default function MaintenanceStatementDetails(){
 const {id}=useParams(),{lang}=useLanguage(),L=useCycleLanguage(),[data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[line,setLine]=useState(blank),[comment,setComment]=useState(''),[sourceDocs,setSourceDocs]=useState([])
 async function load(){setError(null);setSourceDocs([]);try{const d=await readStatement(id);setData(d);if(d.can_edit&&['draft','rejected'].includes(d.statement.status))setSourceDocs(await readStatementCertificates(cycleRpc,id))}catch(e){setError(e)}}
 useEffect(()=>{load()},[id])
 async function run(action,payload={}){if(busy)return;setBusy(true);setError(null);try{await statementAction(action,id,payload);setLine(blank);await load()}catch(e){setError(e.message==='Training financial closeout permits included zero-value lines only'?{message:L('هذا مستخلص تدريبي. اختر «ضمن العقد» واترك كل التكاليف بقيمة صفر.','This training statement requires Included coverage and zero costs.')} : e)}finally{setBusy(false)}}
 async function registerCertificate(document){if(busy)return;setBusy(true);setError(null);try{const certificate=await registerStatementCertificate(cycleRpc,id,document.document_id);await load();setLine({...blank,certificate_id:certificate})}catch(e){setError(e)}finally{setBusy(false)}}
 async function runMeasurement(action,payload){
  if(busy)return false
  setBusy(true);setError(null)
  try{await cycleRpc('bf44_statement_measure',{p_statement:id,p_action:action,p_data:payload});await load();return true}
  catch(e){setError(e);return false}
  finally{setBusy(false)}
 }
 const {can}=useAuth()
 const [periodEvidence,setPeriodEvidence]=useState(null)
 const canReadCosts=can('finance.view')||can('finance.manage')||can('costing.view')
 async function loadEvidence(){
  setBusy(true);setError(null)
  try{return await cycleRpc('bf44_statement_cost_evidence',{p_statement:id})}
  catch(e){setError(e);return null}finally{setBusy(false)}
 }
 async function importLabor(certificate,rate){
  if(busy)return false
  setBusy(true);setError(null)
  try{await cycleRpc('bf44_import_statement_labor',{p_statement:id,p_certificate:certificate,p_rate:rate});await load();return true}
  catch(e){setError(e);return false}finally{setBusy(false)}
 }
 const monthly=data?.statement.statement_kind==='monthly'
 const training=data?.zero_value_training===true
 const st=data?.statement,editable=data?.can_edit&&['draft','rejected'].includes(st?.status),total=data?.total||'0.00'
 const next=statementNextAction(st?.status,Boolean(data?.lines.length),data?.cycle_closed===true)
 const roles={contractor:L('مسؤول المستخلصات لدى شركة الصيانة','Maintenance company statement preparer'),owner:L('ممثل المالك','Owner representative'),consultant:L('الاستشاري','Consultant'),supervisor:L('مشرف الصيانة','Maintenance supervisor')}
 const action=next&&{...next.action,title:L(...next.title),responsible:data?.reviewers?.[next.action.role]||roles[next.action.role]}
 return <section className="facility-module"><div className="page-head no-print"><div><Link to="/statements">← {L('المستخلصات','Statements')}</Link><h1>{st?.statement_number||L('المستخلص','Statement')}</h1></div><div className="row-actions"><button className="btn secondary" disabled={busy} onClick={load}>{L('تحديث','Refresh')}</button><button className="btn secondary" disabled={!data} onClick={()=>window.print()}>{L('طباعة / حفظ PDF','Print / save PDF')}</button></div></div><CycleError error={error}/>
  {data&&<>{!data.can_edit&&['draft','rejected'].includes(st.status)&&<div className="facility-panel no-print" role="status"><h2>{L('بانتظار شركة الصيانة','Awaiting the maintenance company')}</h2><p>{L('المستخلص لدى شركة الصيانة لإعداده وتقديمه. ستظهر إجراءات المالك بعد إرساله للاعتماد.','The maintenance company is preparing this statement. Owner review actions become available once it is submitted for approval.')}</p></div>}<div className="cycle-print"><article className="cycle-report"><header><strong>{L('بصمة النوابغ','Basmat Alnawabigh')}</strong><div><h2>{monthly?L('المستخلص الشهري لأعمال الصيانة','Monthly maintenance statement'):L('مستخلص أعمال الصيانة','Maintenance work statement')}</h2><b>{st.statement_number}</b></div></header><div className="cycle-chain">{[data.project.owner,data.project.provider,data.project.contract,data.project.name].map((v,i)=><span key={i}>{v}</span>)}</div><p>{st.period_start} — {st.period_end} · <CycleStatus value={st.status}/></p><div className="table-wrap"><table><thead><tr>{[L('شهادة الإنجاز','Certificate'),L('أمر العمل / الأصل','Work order / asset'),L('التغطية','Coverage'),L('العمالة','Labor'),L('القطع','Parts'),L('المعدات','Plant'),L('أخرى','Other'),L('قيمة البند','Line value')].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.lines.map(l=><tr key={l.certificate_id}><td>{l.certificate_number}</td><td>{l.work_order_number}<small>{l.asset} · {l.serial_number}</small></td><td>{l.coverage==='billable'?L('مستحق','Billable'):l.coverage==='warranty'?L('ضمان','Warranty'):L('ضمن العقد','Included')}</td>{['labor','parts','plant','other','net_amount'].map(k=><td key={k}>{formatCycleMoney(l[k],lang)}</td>)}</tr>)}</tbody></table></div><h3>{L('إجمالي قيمة الأعمال','Total work value')}: {formatCycleMoney(total,lang)} {data.currency}</h3><h3>{L('أساس التسعير والتغطية','Pricing & coverage basis')}</h3>{data.lines.map(l=><p key={l.certificate_id}><strong>{l.certificate_number}</strong>: {l.basis}</p>)}{monthly&&<StatementMeasurementTable rows={data.work_measurements||[]} currency={data.currency}/>}{st.approved_at&&<p>{L('تاريخ اعتماد المالك وإغلاق الدورة','Owner approval and cycle closeout date')}: {new Date(st.approved_at).toLocaleString()}</p>}{st.comment&&<p>{L('سبب الإعادة','Return reason')}: {st.comment}</p>}</article></div>
   {editable&&sourceDocs.length>0&&<div className="facility-panel no-print"><h2>{L('شهادات إنجاز معتمدة متاحة للربط','Approved completion certificates available to link')}</h2><p>{L('اربط الشهادة الموجودة بسجل المستخلصات بنفس رقمها وتاريخها، ثم اخترها لإضافة البند. هذا الإجراء لا يضيف مبلغ مطالبة ولا يعيد إصدار الشهادة.','Link the existing certificate using its original number and issue date, then select it to add a line. Linking does not create a claim amount or reissue the certificate.')}</p>{sourceDocs.map(doc=><div className="cycle-inline" key={doc.document_id}><span>{doc.document_number} · {doc.work_order_number} · {new Date(doc.generated_at).toLocaleDateString(lang)}</span><button type="button" className="btn primary" disabled={busy} onClick={()=>registerCertificate(doc)}>{L('ربط الشهادة وإتاحتها بالقائمة','Link certificate to the list')}</button></div>)}</div>}
   {editable&&!(data.eligible?.length||data.lines?.length)&&<div className="facility-panel no-print" role="status"><p>{sourceDocs.length?L('الشهادة المعتمدة ظاهرة أعلاه. اضغط «ربط الشهادة وإتاحتها بالقائمة» أولًا.','The approved certificate is shown above. Select “Link certificate to the list” first.'):L('لا توجد شهادات إنجاز مؤهلة ضمن مشروع المستخلص وفترته. تحقّق من إصدار شهادة معتمدة لنفس المالك والعقد والمشروع، وأنها غير مدرجة في مستخلص آخر.','No eligible completion certificates match this statement’s project and period. Check that a final certificate exists for the same owner, contract and project and is not included in another statement.')}</p></div>}
   {editable&&monthly&&<StatementMeasurements key={id} data={data} busy={busy} run={runMeasurement} loadEvidence={canReadCosts?loadEvidence:null} importLabor={importLabor}/>}
   {editable&&!monthly&&<form className="facility-panel no-print" onSubmit={e=>{e.preventDefault();run('add_line',training?{...blank,certificate_id:line.certificate_id,basis:line.basis}:line)}}><h2>{L('إضافة / تعديل بند بشهادة إنجاز','Add / amend a certified work line')}</h2>{training&&<p className="workspace-muted">{L('مستخلص تدريبي · التغطية ضمن العقد وقيمة البند 0.00. اختر الشهادة وأدخل سبب التغطية.','Training statement · Included coverage and a line value of 0.00. Select the certificate and enter the coverage basis.')}</p>}<div className="form-grid"><CycleField label={L('شهادة الإنجاز','Completion certificate')}><select required value={line.certificate_id} onChange={e=>{const existing=data.lines.find(l=>l.certificate_id===e.target.value);setLine(existing?{...existing}: {...blank,certificate_id:e.target.value})}}><option value="">—</option>{[...data.eligible.map(c=>({id:c.id,number:c.number})),...data.lines.map(c=>({id:c.certificate_id,number:c.certificate_number}))].map(c=><option key={c.id} value={c.id}>{c.number}</option>)}</select></CycleField>{!training&&<><CycleField label={L('تغطية العقد','Contract coverage')}><select value={line.coverage} onChange={e=>setLine({...line,coverage:e.target.value,...(e.target.value!=='billable'?{labor:'0',parts:'0',plant:'0',other:'0'}:{})})}><option value="included">{L('ضمن العقد — دون مطالبة إضافية','Included — no additional charge')}</option><option value="warranty">{L('ضمان — دون مطالبة إضافية','Warranty — no additional charge')}</option><option value="billable">{L('مستحق وفق العقد','Billable under contract')}</option></select></CycleField>{[['labor','العمالة','Labor'],['parts','قطع الغيار','Spare parts'],['plant','المعدات','Plant'],['other','أخرى','Other']].map(([key,ar,en])=><CycleField key={key} label={L(ar,en)+' · '+data.currency}><input type="number" min="0" step="0.01" required disabled={line.coverage!=='billable'} value={line[key]} onChange={e=>setLine({...line,[key]:e.target.value})}/></CycleField>)}</>}<CycleField label={L('مرجع التسعير / بند العقد / سبب التغطية','Rate reference / contract item / coverage basis')}><textarea required minLength={5} maxLength={2000} value={line.basis} onChange={e=>setLine({...line,basis:e.target.value})}/></CycleField></div>{canReadCosts&&line.certificate_id&&<div className="row-actions">
    <button type="button" disabled={busy} className="btn secondary" onClick={async()=>setPeriodEvidence(await loadEvidence())}>{L('عرض تكلفة أمر العمل الداخلية','Show internal work order cost')}</button>
    <StatementCostEvidence selectedCost={periodEvidence?.[line.certificate_id]} currency={data.currency}/>
   </div>}<button disabled={busy} className="btn primary">{L('حفظ البند','Save line')}</button></form>}
   <div className="row-actions no-print">{editable&&data.lines.length>0&&<button className="btn primary" disabled={busy} onClick={()=>run('submit')}>{L('تقديم للاعتماد','Submit for approval')}</button>}{data.can_review&&['consultant_review','owner_review'].includes(st.status)&&<><textarea maxLength={2000} aria-label={L('ملاحظة / سبب الإعادة','Comment / return reason')} value={comment} onChange={e=>setComment(e.target.value)}/><button className="btn primary" disabled={busy} onClick={()=>run('approve',{comment})}>{st.status==='owner_review'?L('اعتماد المستخلص وإغلاق الدورة','Approve statement & close cycle'):L('اعتماد الاستشاري','Consultant approval')}</button><button className="btn danger-soft" disabled={busy||comment.trim().length<5} onClick={()=>run('reject',{comment})}>{L('إعادة للتصحيح','Return for correction')}</button></>}</div>
  </>}
 </section>
}


