import {useEffect,useState} from 'react'
import {cycleRpc} from '../lib/maintenanceCycle'
import {supabase} from '../lib/supabaseClient'
import {CycleError,CycleField,useCycleLanguage} from './CycleFields'

const bucket='bf-final-certificates'
const empty={source:'internal',certificateRef:'',certificateNote:'',register:'',adjustment:'0',basis:'',returnNote:''}

export default function FinalStatementPanel({projects}){
 const L=useCycleLanguage()
 const eligible=projects.filter(p=>p.contract&&p.policy?.status==='active'&&(p.can_finance||p.can_activate))
 const [project,setProject]=useState('')
 return eligible.length>0&&<div className="facility-panel">
  <h2>{L('المستخلص الختامي','Final statement')}</h2>
  <CycleField label={L('المشروع والعقد','Project and contract')}>
   <select value={project} onChange={e=>setProject(e.target.value)}>
    <option value="">{L('اختر المشروع','Select project')}</option>
    {eligible.map(p=><option key={p.id} value={p.id}>{p.owner} · {p.name} · {p.contract}</option>)}
   </select>
  </CycleField>
  {project&&eligible.some(p=>p.id===project)&&<FinalRecord key={project} project={project}/>}
 </div>
}

function FinalRecord({project}){
 const L=useCycleLanguage()
 const [data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false)
 const [form,setForm]=useState(empty),[file,setFile]=useState(null),[registerFile,setRegisterFile]=useState(null)
 const set=(field,value)=>setForm(current=>({...current,[field]:value}))
 useEffect(()=>{
  let active=true
  cycleRpc('bf_final_statement',{p_project:project,p_action:'read'}).then(result=>{
   if(active)setData(result)
  }).catch(e=>{if(active)setError(e)})
  return ()=>{active=false}
 },[project])
 const f=data?.record
 const status=f?.status||'draft'
 const owner=data?.owner,finance=data?.finance
 const progress={
  draft:[L('إعداد شهادة الإنجاز الختامية','Prepare the final completion certificate'),L('شركة الصيانة','Maintenance company')],
  certificate_review:[L('مراجعة شهادة الإنجاز الختامية','Review the final completion certificate'),L('ممثل المالك','Owner representative')],
  certificate_approved:[L('تقديم المستخلص الختامي وحصر الأعمال','Submit the final statement and work measurements'),L('شركة الصيانة','Maintenance company')],
  statement_review:[L('مراجعة المستخلص الختامي واعتماده','Review and approve the final statement'),L('ممثل المالك','Owner representative')],
  closed:[L('تم الإغلاق','Closed')]
 }[status]
 async function action(name,makePayload=()=>({})){
  if(busy)return
  setBusy(true);setError(null)
  try{
   const payload=await makePayload()
   setData(await cycleRpc('bf_final_statement',{p_project:project,p_action:name,p_data:payload}))
   set('returnNote','')
  }catch(e){setError(e)}finally{setBusy(false)}
 }
 async function submitCertificate(e){
  e.preventDefault()
  await action('submit_certificate',async()=>{
   const payload={source:form.source,reference:form.certificateRef,note:form.certificateNote}
   if(form.source==='external')payload.attachment=await uploadPdf(file)
   return payload
  })
 }
 async function uploadPdf(pdf){
  if(!pdf||pdf.type!=='application/pdf'||pdf.size>10485760)throw Error(L('أرفق ملف PDF لا يزيد عن 10 ميغابايت.','Attach a PDF no larger than 10 MB.'))
  const path=f.id+'/'+crypto.randomUUID()+'.pdf'
  const {error}=await supabase.storage.from(bucket).upload(path,pdf,{contentType:'application/pdf'})
  if(error)throw error
  return path
 }
 async function viewExternal(path){
  setError(null)
  const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,60)
  if(error){setError(error);return}
  window.open(data.signedUrl,'_blank','noopener,noreferrer')
 }
 function printCertificate(){
  const print=window.open('','_blank')
  if(!print){setError(Error(L('اسمح بفتح نافذة الطباعة.','Allow the print window to open.')));return}
  print.opener=null
  print.document.documentElement.dir=document.documentElement.dir||'ltr'
  print.document.body.style.cssText='font-family:system-ui;padding:2rem;line-height:1.8'
  const article=document.getElementById('final-certificate-preview')
  print.document.body.append(print.document.importNode(article,true))
  print.print()
 }
 if(!data)return <CycleError error={error}/>
 const button=(name,label,payload,disabled=false)=><button type="button" className="btn secondary" disabled={busy||disabled} onClick={()=>action(name,payload)}>{label}</button>
 const returning=()=>({note:form.returnNote})
 return <div>
  <CycleError error={error}/>
  <div className="cycle-chain" role="status"><strong>{progress[0]}</strong>{progress[1]&&<span>{L('المسؤول عن الإجراء التالي','Responsible for the next action')} · {progress[1]}</span>}</div>
  {f?.review_note&&<p>{L('سبب الإعادة','Return reason')} · {f.review_note}</p>}
  {!f&&finance&&button('create',L('إنشاء مسودة المستخلص الختامي','Create final statement draft'))}
  {f&&status==='draft'&&finance&&<form onSubmit={submitCertificate} className="form-grid">
   <CycleField label={L('مصدر الشهادة','Certificate source')}>
    <select value={form.source} onChange={e=>set('source',e.target.value)}>
     <option value="internal">{L('إصدار من النظام','Issue in the system')}</option>
     <option value="external">{L('رفع شهادة معتمدة خارجيًا','Upload an externally approved certificate')}</option>
    </select>
   </CycleField>
   {form.source==='external'&&<>
    <CycleField label={L('رقم الشهادة الخارجية','External certificate reference')}><input required minLength={2} maxLength={160} value={form.certificateRef} onChange={e=>set('certificateRef',e.target.value)}/></CycleField>
    <CycleField label={L('ملف الشهادة PDF','Certificate PDF')}><input required type="file" accept="application/pdf" onChange={e=>setFile(e.target.files[0])}/></CycleField>
   </>}
   <CycleField label={L('نطاق الأعمال في الشهادة','Work covered by the certificate')}><textarea required minLength={5} maxLength={2000} value={form.certificateNote} onChange={e=>set('certificateNote',e.target.value)}/></CycleField>
   <button className="btn primary" disabled={busy}>{L('إرسال الشهادة إلى ممثل المالك','Submit certificate to owner representative')}</button>
  </form>}
  {f?.snapshot&&status!=='draft'&&<>
   <article id="final-certificate-preview">
    <h3>{L('شهادة الإنجاز الختامية','Final completion certificate')}</h3>
    <p>{f.certificate_ref} · {f.snapshot.owner} · {f.snapshot.project} · {f.snapshot.contract}</p>
    <p>{f.snapshot.provider} · {f.certificate_approved_at?L('اعتمدها ممثل المالك','Approved by owner representative'):L('بانتظار اعتماد ممثل المالك','Pending owner representative approval')}</p>
    <p>{f.certificate_note}</p>
   </article>
   {f.source==='external'?<button type="button" className="btn secondary" onClick={()=>viewExternal(f.attachment)}>{L('عرض الشهادة المرفقة','View attached certificate')}</button>:
    <button type="button" className="btn secondary" onClick={printCertificate}>{L('طباعة الشهادة','Print certificate')}</button>}
   <details>
    <summary>{L('حصر الأعمال المعتمدة سابقًا','Previously approved work measurements')}</summary>
    <p>{L('إجمالي المطالبات المعتمدة سابقًا','Total previously approved claims')} · {f.snapshot.prior_claim} {f.snapshot.currency}</p>
    <div className="table-wrap"><table>
     <thead><tr>{[L('المستخلص والشهادة','Statement and certificate'),L('أمر العمل','Work order'),L('البند والكمية والموقع','Item, quantity and location'),L('قيمة المطالبة السابقة','Previous claim')].map(label=><th key={label}>{label}</th>)}</tr></thead>
     <tbody>{f.snapshot.lines.map(line=><tr key={line.certificate_number}>
      <td>{line.statement_number} · {line.certificate_number}</td><td>{line.work_order_number}</td>
      <td>{line.measurements.length?line.measurements.map(m=><div key={m.item}>{m.item} · {m.description} · {m.quantity} {m.unit}{m.location?' · '+m.location:''}</div>):line.basis||'—'}</td>
      <td>{line.net_amount}</td>
     </tr>)}</tbody>
    </table></div>
   </details>
  </>}
  {f&&status==='certificate_approved'&&finance&&<form className="form-grid" onSubmit={e=>{
   e.preventDefault()
   action('submit_statement',async()=>({reference:form.register,attachment:await uploadPdf(registerFile),adjustment:form.adjustment,note:form.basis}))
  }}>
   <CycleField label={L('مرجع حصر الأعمال الختامي','Final work measurement register reference')}><input required minLength={2} maxLength={160} value={form.register} onChange={e=>set('register',e.target.value)}/></CycleField>
   <CycleField label={L('ملف حصر الأعمال PDF','Work measurement register PDF')}><input required type="file" accept="application/pdf" onChange={e=>setRegisterFile(e.target.files[0])}/></CycleField>
   <CycleField label={L('التسوية الختامية الإضافية (يمكن إدخال صفر)','Additional final adjustment (zero allowed)')}><input required type="number" step="0.01" value={form.adjustment} onChange={e=>set('adjustment',e.target.value)}/></CycleField>
   <CycleField label={L('أساس التسوية الختامية','Final adjustment basis')}><textarea required minLength={5} maxLength={2000} value={form.basis} onChange={e=>set('basis',e.target.value)}/></CycleField>
   <button className="btn primary" disabled={busy}>{L('تقديم المستخلص الختامي إلى المالك','Submit final statement to owner')}</button>
  </form>}
  {f&&['statement_review','closed'].includes(status)&&<>
   <p>{L('مرجع الحصر','Measurement register reference')} · {f.register_reference}</p>
   <button type="button" className="btn secondary" onClick={()=>viewExternal(f.register_attachment)}>{L('عرض ملف حصر الأعمال','View work measurement register')}</button>
   <p>{L('قيمة التسوية الإضافية','Additional adjustment')} · {f.adjustment} {f.snapshot.currency} · {f.adjustment_basis}</p>
  </>}
  {owner&&['certificate_review','certificate_approved','statement_review'].includes(status)&&<div>
   <CycleField label={L('سبب الإعادة عند الحاجة','Reason if returning')}><textarea maxLength={2000} value={form.returnNote} onChange={e=>set('returnNote',e.target.value)}/></CycleField>
   {status==='certificate_review'&&button('approve_certificate',L('اعتماد شهادة الإنجاز الختامية','Approve final completion certificate'))}
   {status==='statement_review'&&button('close',L('اعتماد المستخلص وإغلاقه','Approve and close final statement'))}
   {button({certificate_review:'return_certificate',certificate_approved:'return_approved_certificate',statement_review:'return_statement'}[status],L('إعادة إلى شركة الصيانة','Return to maintenance company'),returning,form.returnNote.trim().length<5)}
  </div>}
 </div>
}
