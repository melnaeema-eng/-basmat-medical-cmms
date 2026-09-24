import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMyExecutionPackages,loadExecutionResults,loadExecutionAttachments,uploadExecutionEvidence,removeExecutionEvidence,openExecutionEvidence,startExecutionPackage,submitExecutionStep,completeExecutionPackage} from '../lib/maintenanceExecution'
import {Notice} from '../components/FacilityFields'

function val(x){return x==null?'—':String(x)}
function dateTime(x){if(!x)return'—';try{return new Date(x).toLocaleString()}catch{return x}}
function stepsOf(p){return Array.isArray(p?.procedure_snapshot?.steps)?p.procedure_snapshot.steps:[]}
function assetOf(p){return p?.procedure_snapshot?.asset||{}}
function jobOf(p){return p?.procedure_snapshot?.job||p?.procedure_snapshot?.work_order||{}}

export default function TechnicianExecution(){
 const {lang}=useLanguage()
 const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[results,setResults]=useState([]),[attachments,setAttachments]=useState([])
 const [drafts,setDrafts]=useState({}),[files,setFiles]=useState({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false)
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[closeNote,setCloseNote]=useState('')
 const ar=lang==='ar'

 async function load(){
  try{
   setLoading(true);setError('')
   const r=await loadMyExecutionPackages()
   setRows(r)
   if(selected){
    const updated=r.find(x=>x.id===selected.id)
    if(updated)setSelected(updated)
   }
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 async function pick(p){
  try{
   setSelected(p);setError('');setSuccess('')
   const [r,a]=await Promise.all([loadExecutionResults(p.id),loadExecutionAttachments(p.id)])
   setResults(r);setAttachments(a)
   const d={}
   for(const x of r)d[x.step_seq]={pass_fail:x.pass_fail||'',reading_value:x.reading_value??'',result_text:x.result_text||'',notes:x.notes||''}
   setDrafts(d)
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[])

 const steps=useMemo(()=>stepsOf(selected),[selected])
 const asset=useMemo(()=>assetOf(selected),[selected])
 const job=useMemo(()=>jobOf(selected),[selected])
 const doneSeq=useMemo(()=>new Set(results.map(x=>Number(x.step_seq))),[results])
 const required=steps.filter(x=>x.required!==false).length
 const doneRequired=steps.filter(x=>x.required!==false&&doneSeq.has(Number(x.seq))).length
 const progress=required?Math.round(doneRequired/required*100):0

 function draft(seq){return drafts[seq]||{pass_fail:'',reading_value:'',result_text:'',notes:''}}
 function setDraft(seq,key,value){setDrafts(x=>({...x,[seq]:{...draft(seq),[key]:value}}))}
 function stepAttachments(seq){return attachments.filter(x=>Number(x.step_seq)===Number(seq))}
 async function uploadFiles(s){
  const list=Array.from(files[s.seq]||[])
  if(!list.length)return
  try{
   setUploading(true);setError('');setSuccess('')
   for(const f of list)await uploadExecutionEvidence(selected,s.seq,f)
   setFiles(x=>({...x,[s.seq]:[]}))
   setAttachments(await loadExecutionAttachments(selected.id))
   setSuccess(ar?'تم رفع المرفقات إلى التخزين الآمن.':'Evidence uploaded to secure storage.')
  }catch(e){setError(e.message)}finally{setUploading(false)}
 }
 async function removeAttachment(a){
  try{
   setUploading(true);setError('')
   await removeExecutionEvidence(a)
   setAttachments(await loadExecutionAttachments(selected.id))
  }catch(e){setError(e.message)}finally{setUploading(false)}
 }
 async function openAttachment(a){
  try{setError('');await openExecutionEvidence(a)}catch(e){setError(e.message)}
 }

 async function start(){
  try{setBusy(true);setError('');await startExecutionPackage(selected.id);await load();setSuccess(ar?'تم بدء التنفيذ.':'Execution started.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function saveStep(s){
  try{
   setBusy(true);setError('');setSuccess('')
   await submitExecutionStep(selected.id,{seq:s.seq,...draft(s.seq)})
   const r=await loadExecutionResults(selected.id);setResults(r)
   setSuccess(ar?`تم حفظ الخطوة ${s.seq}.`:`Step ${s.seq} saved.`)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function complete(){
  try{
   setBusy(true);setError('');setSuccess('')
   await completeExecutionPackage(selected.id,closeNote)
   await load()
   const r=await loadMyExecutionPackages()
   const u=r.find(x=>x.id===selected.id);if(u)setSelected(u)
   setSuccess(ar?'تم إكمال الإجراء بنجاح.':'Procedure completed successfully.')
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 return <section className="facility-module">
  <style>{`
   .tech-wrap{display:grid;grid-template-columns:minmax(280px,360px) 1fr;gap:14px}
   .tech-list{max-height:72vh;overflow:auto}
   .tech-card{border:1px solid #dfe7ef;border-radius:14px;padding:12px;margin-bottom:8px;background:#fff;cursor:pointer}
   .tech-card.active{outline:2px solid #245a8d}
   .tech-step{border:1px solid #dfe7ef;border-radius:14px;padding:14px;margin:10px 0;background:#fff}
   .tech-step.done{border-color:#9fc6ad}
   .tech-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px}
   .tech-badge{display:inline-block;border:1px solid #dfe7ef;border-radius:999px;padding:3px 8px;margin:2px;font-size:10px}
   .tech-progress{height:10px;background:#edf2f6;border-radius:999px;overflow:hidden}
   .tech-progress>div{height:100%;background:#245a8d}
   @media(max-width:900px){.tech-wrap{grid-template-columns:1fr}.tech-list{max-height:none}}
  `}</style>

  <div className="page-head">
   <div><h1>🧰 {ar?'تنفيذ مهام الفني':'Technician Execution'}</h1>
    <p>{ar?'إجراءات الصيانة الجاهزة للأصول المعيّنة لك — الأجهزة الطبية والأجهزة الطبية.':'Ready-to-execute maintenance procedures assigned to you — Facilities and Medical.'}</p>
   </div>
  </div>
  <Notice error={error} success={success}/>

  <div className="tech-wrap">
   <div className="facility-panel tech-list">
    <h2>{ar?'المهام المعينة':'Assigned jobs'} ({rows.length})</h2>
    {loading&&<p>Loading…</p>}
    {!loading&&!rows.length&&<p>{ar?'لا توجد مهام معينة حالياً.':'No assigned jobs.'}</p>}
    {rows.map(p=>{
     const a=assetOf(p),j=jobOf(p)
     return <div key={p.id} className={'tech-card '+(selected?.id===p.id?'active':'')} onClick={()=>pick(p)}>
      <div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>{p.procedure_name_en||p.procedure_name_ar||'Procedure'}</b><span className="tech-badge">{p.status}</span></div>
      <div style={{fontSize:12,marginTop:5}}>{a.asset_tag||a.serial_number||j.job_number||j.work_order_number||'—'}</div>
      <div><span className="tech-badge">{p.domain}</span><span className="tech-badge">{p.source_type}</span>{p.required_skill&&<span className="tech-badge">{p.required_skill}</span>}</div>
     </div>
    })}
   </div>

   <div>
    {!selected&&<div className="facility-panel"><p>{ar?'اختر مهمة لعرض الإجراء الكامل.':'Select a job to view the full procedure.'}</p></div>}
    {selected&&<>
     <div className="facility-panel">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
       <div><h2 style={{margin:'0 0 4px'}}>{ar?selected.procedure_name_ar:selected.procedure_name_en}</h2><div>{selected.procedure_name_en}</div></div>
       <div><span className="tech-badge">{selected.domain}</span><span className="tech-badge">{selected.source_type}</span><span className="tech-badge">{selected.status}</span></div>
      </div>

      <div className="tech-grid" style={{marginTop:12}}>
       <div><small>{ar?'الأصل':'Asset'}</small><div><b>{asset.asset_tag||asset.serial_number||'—'}</b></div></div>
       <div><small>{ar?'الموديل':'Model'}</small><div>{asset.model||'—'}</div></div>
       <div><small>{ar?'القسم/الموقع':'Department / Location'}</small><div>{asset.department||asset.location_text||asset.site_name||'—'}</div></div>
       <div><small>{ar?'المدة':'Estimated time'}</small><div>{selected.estimated_minutes?`${selected.estimated_minutes} min`:'—'}</div></div>
       <div><small>{ar?'التكرار':'Interval'}</small><div>{selected.interval_value?`${selected.interval_value} ${selected.interval_unit||''}`:'—'}</div></div>
       <div><small>{ar?'مصدر الإجراء':'Procedure source'}</small><div>{selected.source_name||selected.source_type}</div></div>
       <div><small>{ar?'المستند':'Document'}</small><div>{selected.source_document||'—'}</div></div>
       <div><small>{ar?'الإصدار':'Revision'}</small><div>{selected.procedure_revision||'—'}</div></div>
      </div>

      <hr/>
      <div className="tech-grid">
       <div><b>{ar?'المهارة المطلوبة':'Required skill'}</b><div>{val(selected.required_skill)}</div></div>
       <div><b>{ar?'عدد الفنيين':'Personnel'}</b><div>{val(selected.required_personnel)}</div></div>
       <div><b>{ar?'الأدوات':'Tools'}</b><div>{val(selected.required_tools)}</div></div>
       <div><b>{ar?'أجهزة القياس':'Test equipment'}</b><div>{val(selected.required_test_equipment)}</div></div>
       <div><b>PPE</b><div>{val(selected.required_ppe)}</div></div>
       <div><b>{ar?'المواد/المستهلكات':'Consumables'}</b><div>{val(selected.required_consumables)}</div></div>
      </div>

      {selected.prerequisites&&<div style={{marginTop:10}}><b>{ar?'قبل البدء':'Prerequisites'}:</b> {selected.prerequisites}</div>}
      <div style={{marginTop:8}}>
       {selected.shutdown_required&&<span className="tech-badge">⛔ Shutdown</span>}
       {selected.loto_required&&<span className="tech-badge">🔒 LOTO</span>}
       {selected.permit_required&&<span className="tech-badge">📄 Permit</span>}
      </div>

      <div style={{marginTop:14}}>
       <div style={{display:'flex',justifyContent:'space-between'}}><b>{ar?'التقدم':'Progress'}</b><span>{progress}% ({doneRequired}/{required})</span></div>
       <div className="tech-progress"><div style={{width:`${progress}%`}}/></div>
      </div>

      {selected.status==='assigned'&&<button className="btn primary" disabled={busy} style={{marginTop:12}} onClick={start}>▶ {ar?'بدء التنفيذ':'Start Execution'}</button>}
     </div>

     {steps.map(s=>{
      const d=draft(s.seq),done=doneSeq.has(Number(s.seq))
      return <div className={'tech-step '+(done?'done':'')} key={s.seq}>
       <div style={{display:'flex',justifyContent:'space-between',gap:10}}>
        <h3 style={{margin:0}}>{s.seq}. {ar?s.title_ar:s.title_en}</h3>
        <div>{s.required!==false&&<span className="tech-badge">{ar?'إلزامي':'Required'}</span>}{done&&<span className="tech-badge">✓ {ar?'محفوظ':'Saved'}</span>}</div>
       </div>
       <p>{ar?s.instructions_ar:s.instructions_en}</p>

       {s.safety_notes&&<div style={{padding:9,border:'1px solid #ead7a3',borderRadius:10,marginBottom:8}}>⚠️ <b>{ar?'السلامة':'Safety'}:</b> {s.safety_notes}</div>}
       {s.acceptance_text&&<div><b>{ar?'معيار القبول':'Acceptance'}:</b> {s.acceptance_text}</div>}
       {s.tools&&<div><b>{ar?'الأدوات':'Tools'}:</b> {s.tools}</div>}
       {s.materials&&<div><b>{ar?'المواد':'Materials'}:</b> {s.materials}</div>}
       {(s.min_value!=null||s.max_value!=null)&&<div><b>{ar?'الحدود':'Limits'}:</b> {s.min_value??'—'} → {s.max_value??'—'} {s.unit||''}</div>}
       {s.failure_action&&<div><b>{ar?'عند الفشل':'Failure action'}:</b> {s.failure_action}</div>}
       {s.escalation_role&&<div><b>{ar?'التصعيد إلى':'Escalate to'}:</b> {s.escalation_role}</div>}

       <div className="tech-grid" style={{marginTop:10}}>
        {s.response_type==='pass_fail'&&<label>{ar?'النتيجة':'Result'}<select value={d.pass_fail} onChange={e=>setDraft(s.seq,'pass_fail',e.target.value)}><option value="">Select</option><option value="pass">PASS</option><option value="fail">FAIL</option><option value="na">N/A</option></select></label>}
        {s.response_type==='reading'&&<label>{ar?'القراءة':'Reading'} {s.unit||''}<input type="number" step="any" value={d.reading_value} onChange={e=>setDraft(s.seq,'reading_value',e.target.value)}/></label>}
        {s.response_type==='text'&&<label>{ar?'النتيجة':'Result'}<input value={d.result_text} onChange={e=>setDraft(s.seq,'result_text',e.target.value)}/></label>}
        <label>{ar?'رفع صور/مستندات':'Upload images/documents'} {s.photo_required&&'*'}
         <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={e=>setFiles(x=>({...x,[s.seq]:Array.from(e.target.files||[])}))}/>
        </label>
        <label>{ar?'ملاحظات':'Notes'}<input value={d.notes} onChange={e=>setDraft(s.seq,'notes',e.target.value)}/></label>
       </div>
       <div style={{marginTop:9,display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="btn" disabled={uploading||selected.status==='completed'||!(files[s.seq]?.length)} onClick={()=>uploadFiles(s)}>📎 {ar?'رفع المرفقات':'Upload Evidence'}</button>
        <button className="btn primary" disabled={busy||uploading||selected.status==='completed'} onClick={()=>saveStep(s)}>💾 {ar?'حفظ الخطوة':'Save Step'}</button>
       </div>
       {stepAttachments(s.seq).length>0&&<div style={{marginTop:9}}>
        <b>{ar?'المرفقات المحفوظة':'Stored attachments'}:</b>
        {stepAttachments(s.seq).map(a=><div key={a.id} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:5}}>
         <span>📎 {a.file_name}</span><small>{a.mime_type||''} {a.size_bytes?`· ${Math.ceil(a.size_bytes/1024)} KB`:''}</small>
         <button className="btn" onClick={()=>openAttachment(a)}>{ar?'عرض':'Open'}</button>
         {selected.status!=='completed'&&<button className="btn" disabled={uploading} onClick={()=>removeAttachment(a)}>{ar?'حذف':'Delete'}</button>}
        </div>)}
       </div>}
      </div>
     })}

     {selected.status!=='completed'&&<div className="facility-panel">
      <h2>{ar?'إغلاق المهمة':'Complete Job'}</h2>
      <textarea style={{width:'100%',minHeight:90}} value={closeNote} onChange={e=>setCloseNote(e.target.value)} placeholder={ar?'ملاحظة الإغلاق / تفاصيل أي فشل أو استثناء...':'Closeout note / failure or exception details...'}/>
      <button className="btn primary" disabled={busy||progress<100} onClick={complete}>✅ {ar?'إكمال الإجراء':'Complete Procedure'}</button>
      {progress<100&&<small style={{marginInlineStart:8}}>{ar?'يجب إكمال جميع الخطوات الإلزامية أولاً.':'Complete all required steps first.'}</small>}
     </div>}
    </>}
   </div>
  </div>
 </section>
}
