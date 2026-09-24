import {useEffect,useMemo,useRef,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {
 loadOwnerReportDirectory,loadBranding,saveBranding,loadOwnerReportData,archiveOwnerReport,loadArchivedReports,
 markReportPrinted,markReportSent,markReportAcknowledged,loadReportEvents
} from '../lib/ownerReports'

const iso=d=>d.toISOString().slice(0,10)
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x}
const startOfMonth=d=>new Date(d.getFullYear(),d.getMonth(),1)
const endOfMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0)
const startOfYear=d=>new Date(d.getFullYear(),0,1)
const endOfYear=d=>new Date(d.getFullYear(),11,31)
const titleCase=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const dateFmt=v=>v?new Date(v).toLocaleDateString():'—'
const dateTimeFmt=v=>v?new Date(v).toLocaleString():'—'
const safe=v=>v==null||v===''?'—':v

function periodFor(type){
 const now=new Date()
 if(type==='weekly'){const day=now.getDay()||7;const start=addDays(now,1-day);return [iso(start),iso(addDays(start,6))]}
 if(type==='annual')return [iso(startOfYear(now)),iso(endOfYear(now))]
 return [iso(startOfMonth(now)),iso(endOfMonth(now))]
}
function readLogo(file,setter){
 if(!file)return
 if(file.size>1024*1024){alert('Logo must be 1 MB or less');return}
 const r=new FileReader();r.onload=()=>setter(String(r.result||''));r.readAsDataURL(file)
}
function pctTone(v){return v>=95?'#067647':v>=85?'#b54708':'#b42318'}
function distLabel(status,ar){
 const map={
  final:[ar?'معتمد':'Final','#475569'],
  printed:[ar?'تمت الطباعة':'Printed','#175cd3'],
  sent:[ar?'تم الإرسال':'Sent','#7a5af8'],
  acknowledged:[ar?'تم الاستلام':'Acknowledged','#067647']
 }
 return map[status]||map.final
}

function printSamePage(node){
 if(!node)return
 const body=document.body
 const cleanup=()=>{
  body.classList.remove('owner-report-print-mode')
  node.classList.remove('owner-report-print-target')
  window.removeEventListener('afterprint',cleanup)
 }
 node.classList.add('owner-report-print-target')
 body.classList.add('owner-report-print-mode')
 window.addEventListener('afterprint',cleanup,{once:true})
 window.setTimeout(()=>window.print(),60)
}


export default function OwnerReports(){
 const {lang}=useLanguage(),ar=lang==='ar'
 const printRef=useRef(null),archivePrintRef=useRef(null)
 const [directory,setDirectory]=useState(null)
 const [contractId,setContractId]=useState('')
 const [reportType,setReportType]=useState('monthly')
 const [[start,end],setPeriod]=useState(periodFor('monthly'))
 const [report,setReport]=useState(null),[branding,setBranding]=useState(null),[archives,setArchives]=useState([])
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
 const [editBrand,setEditBrand]=useState(false)
 const [archiveFilter,setArchiveFilter]=useState('all')
 const [selectedRun,setSelectedRun]=useState(null),[events,setEvents]=useState([])
 const [sendRun,setSendRun]=useState(null),[sendTo,setSendTo]=useState(''),[sendNotes,setSendNotes]=useState('')
 const [archivePreview,setArchivePreview]=useState(null)

 useEffect(()=>{
  Promise.all([loadOwnerReportDirectory(),loadArchivedReports()]).then(([d,a])=>{setDirectory(d);setArchives(a)}).catch(e=>setError(e.message))
 },[])
 useEffect(()=>{setPeriod(periodFor(reportType));setReport(null)},[reportType])
 useEffect(()=>{
  if(!contractId){setBranding(null);return}
  loadBranding(contractId).then(setBranding).catch(e=>setError(e.message))
 },[contractId])

 const selectedContract=useMemo(()=>directory?.contracts.find(x=>x.id===contractId),[directory,contractId])
 const owner=useMemo(()=>directory?.clients.find(x=>x.id===selectedContract?.client_id),[directory,selectedContract])
 const org=useMemo(()=>directory?.organizations.find(x=>x.id===selectedContract?.organization_id),[directory,selectedContract])
 const filteredArchives=useMemo(()=>{
  let rows=archives
  if(contractId)rows=rows.filter(x=>x.contract_id===contractId)
  if(archiveFilter!=='all')rows=rows.filter(x=>(x.distribution_status||'final')===archiveFilter)
  return rows
 },[archives,archiveFilter,contractId])

 const refreshArchive=async()=>setArchives(await loadArchivedReports())
 const make=async()=>{
  if(!contractId)return
  try{setLoading(true);setError('');setSaved('');setReport(await loadOwnerReportData({contractId,start,end,lang}))}
  catch(e){setError(e.message)}finally{setLoading(false)}
 }
 const currentBrand=branding||{
  organization_id:selectedContract?.organization_id,contract_id:contractId,
  project_name_ar:selectedContract?.name_ar||'',project_name_en:selectedContract?.name_en||'',
  owner_name_ar:owner?.name_ar||owner?.name||'',owner_name_en:owner?.name_en||owner?.name||'',
  contractor_name_ar:org?.name_ar||org?.name||'',contractor_name_en:org?.name_en||org?.name||'',
  owner_logo_data:'',contractor_logo_data:'',primary_color:'#0b2b4b',secondary_color:'#b8892d',
  prepared_by:'',reviewed_by:'',approved_by:'',report_prefix:'FM'
 }
 const patchBrand=(k,v)=>setBranding({...currentBrand,[k]:v})
 const saveBrand=async()=>{
  try{
   setLoading(true);setError('')
   const payload={...currentBrand,organization_id:selectedContract.organization_id,contract_id:contractId,updated_at:new Date().toISOString()}
   const b=await saveBranding(payload);setBranding(b);setSaved(ar?'تم حفظ هوية التقرير':'Report branding saved');setEditBrand(false)
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 const archive=async()=>{
  if(!report)return
  try{
   setLoading(true);setError('')
   const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,12)
   const reportNumber=`${currentBrand.report_prefix||'FM'}-${reportType.toUpperCase()}-${stamp}`
   const snapshot={
    metrics:report.metrics,woStatus:report.woStatus,ppmStatus:report.ppmStatus,woPriority:report.woPriority,labels:report.labels,
    wo:report.wo.slice(0,200),ppm:report.ppm.slice(0,200),reportType,start,end
   }
   const r=await archiveOwnerReport({
    organization_id:report.contract.organization_id,contract_id:contractId,report_type:reportType,
    period_start:start,period_end:end,report_number:reportNumber,revision:'00',status:'final',distribution_status:'final',
    title_ar:reportTitle(true,reportType),title_en:reportTitle(false,reportType),
    snapshot,branding_snapshot:currentBrand
   })
   setSaved((ar?'تم اعتماد وأرشفة التقرير: ':'Finalized and archived: ')+r.report_number)
   await refreshArchive()
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 const printCurrent=()=>printSamePage(printRef.current)
 const previewArchived=run=>{
  setArchivePreview(run)
  window.setTimeout(()=>archivePrintRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),60)
 }
 const printArchived=async run=>{
  try{
   setLoading(true);setError('')
   const updated=await markReportPrinted(run.id)
   await refreshArchive()
   setArchivePreview(updated)
   setSaved(ar?'تم تسجيل عملية الطباعة.':'Print action recorded.')
   window.setTimeout(()=>printSamePage(archivePrintRef.current),120)
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 const openHistory=async run=>{
  try{setSelectedRun(run);setEvents(await loadReportEvents(run.id))}
  catch(e){setError(e.message)}
 }
 const sendArchived=async()=>{
  if(!sendRun||!sendTo.trim())return
  try{
   setLoading(true);setError('')
   await markReportSent(sendRun.id,{recipient:sendTo.trim(),notes:sendNotes.trim()})
   setSaved(ar?'تم تسجيل التقرير كمرسل للمالك.':'Report marked as sent.')
   setSendRun(null);setSendTo('');setSendNotes('')
   await refreshArchive()
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 const acknowledge=async run=>{
  try{
   setLoading(true);setError('')
   await markReportAcknowledged(run.id)
   setSaved(ar?'تم تسجيل استلام المالك للتقرير.':'Owner acknowledgement recorded.')
   await refreshArchive()
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }

 return <section className="facility-module owner-report-center">
  <style>{`
   .or-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
   .or-cover{min-height:520px;display:flex;flex-direction:column;justify-content:space-between;padding:40px;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(145deg,#fff,#f8fafc)}
   .or-logos{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.or-logo{text-align:center}.or-logo img{max-width:190px;max-height:95px;object-fit:contain}
   .or-title{text-align:center;margin:60px 0}.or-title h1{font-size:32px;color:#0b2b4b;margin:0}.or-title h2{font-size:18px;margin:12px 0;color:#475569}
   .or-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 28px;font-size:12px}.or-meta div{display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb;padding:7px 0}
   .or-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.or-kpi{padding:15px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.or-kpi span{font-size:10px;color:#64748b;display:block}.or-kpi strong{font-size:24px;color:#0b2b4b}
   .or-chart{display:grid;gap:7px}.or-bar{display:grid;grid-template-columns:130px 1fr 40px;gap:8px;align-items:center;font-size:11px}.or-bar i{height:10px;background:#0b2b4b;border-radius:6px;display:block}
   .or-table{width:100%;border-collapse:collapse}.or-table th,.or-table td{font-size:10px;padding:7px;border-bottom:1px solid #edf1f5;text-align:start;vertical-align:top}
   .or-section{margin-top:18px}.or-section h2{color:#0b2b4b;border-bottom:2px solid #0b2b4b;padding-bottom:6px}
   .or-brand-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.or-brand-grid label{display:grid;gap:4px;font-size:11px}.or-brand-grid input{width:100%}
   .or-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:25px;margin-top:45px}.or-signatures div{border-top:1px solid #64748b;padding-top:8px;text-align:center;font-size:11px}
   .or-badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;color:#fff;white-space:nowrap}
   .or-actions{display:flex;gap:5px;flex-wrap:wrap}.or-actions .btn{padding:5px 8px;font-size:10px}
   .or-dialog-backdrop{position:fixed;inset:0;background:#0f172a88;display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px}
   .or-dialog{background:#fff;border-radius:16px;padding:20px;width:min(560px,100%);box-shadow:0 20px 60px #0003}.or-dialog label{display:grid;gap:5px;margin:10px 0}
   .or-history{display:grid;gap:8px}.or-history-item{padding:10px;border:1px solid #e2e8f0;border-radius:10px}
   .archive-preview-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0 8px}
   @media print{
    body.owner-report-print-mode *{visibility:hidden!important}
    body.owner-report-print-mode .owner-report-print-target,
    body.owner-report-print-mode .owner-report-print-target *{visibility:visible!important}
    body.owner-report-print-mode .owner-report-print-target{
     position:absolute!important;left:0!important;top:0!important;width:100%!important;
     margin:0!important;padding:0!important;background:#fff!important
    }
    body.owner-report-print-mode .owner-report-print-target .or-cover{
     min-height:270mm!important;border-radius:0!important;page-break-after:always!important
    }
    body.owner-report-print-mode .owner-report-print-target .or-section{break-inside:avoid!important}
    @page{size:A4;margin:12mm}
   }
  `}</style>

  <div className="page-head"><div><h1>{ar?'مركز تقارير المالك للأجهزة الطبية':'Medical Owner Reporting Center'}</h1><p>{ar?'تقارير صيانة الأجهزة الطبية الأسبوعية والشهرية والسنوية مع الأرشيف وتتبع الطباعة والإرسال.':'Weekly, monthly and annual medical-equipment maintenance reports with archive and report-only printing.'}</p></div></div>
  {error&&<div className="facility-panel" style={{color:'#b42318'}}>{error}</div>}
  {saved&&<div className="facility-panel" style={{color:'#067647'}}>{saved}</div>}

  <div className="facility-panel no-print">
   <div className="or-controls">
    <label>{ar?'العقد':'Contract'}<select value={contractId} onChange={e=>{setContractId(e.target.value);setReport(null)}}><option value="">{ar?'كل العقود / اختر عقد للتقرير الجديد':'All contracts / select for new report'}</option>{directory?.contracts.map(c=><option key={c.id} value={c.id}>{c.contract_number||c.number||c.code||c.id}</option>)}</select></label>
    <label>{ar?'نوع التقرير':'Report type'}<select value={reportType} onChange={e=>setReportType(e.target.value)}><option value="weekly">{ar?'أسبوعي':'Weekly'}</option><option value="monthly">{ar?'شهري':'Monthly'}</option><option value="annual">{ar?'سنوي':'Annual'}</option></select></label>
    <label>{ar?'من':'From'}<input type="date" value={start} onChange={e=>setPeriod([e.target.value,end])}/></label>
    <label>{ar?'إلى':'To'}<input type="date" value={end} onChange={e=>setPeriod([start,e.target.value])}/></label>
   </div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
    <button className="btn primary" disabled={!contractId||loading} onClick={make}>{loading?(ar?'جاري التحميل...':'Loading...'):(ar?'إنشاء التقرير':'Generate report')}</button>
    <button className="btn" disabled={!contractId} onClick={()=>setEditBrand(!editBrand)}>{ar?'هوية التقرير':'Report branding'}</button>
    {report&&<><button className="btn" onClick={printCurrent}>{ar?'طباعة التقرير فقط / PDF':'Print Report Only / PDF'}</button><button className="btn" disabled={loading} onClick={archive}>{ar?'اعتماد وأرشفة':'Finalize & Archive'}</button></>}
   </div>
  </div>

  {editBrand&&contractId&&<div className="facility-panel no-print">
   <h2>{ar?'هوية تقرير العقد':'Contract Report Branding'}</h2>
   <div className="or-brand-grid">
    <label>{ar?'اسم المشروع عربي':'Project name Arabic'}<input value={currentBrand.project_name_ar||''} onChange={e=>patchBrand('project_name_ar',e.target.value)}/></label>
    <label>{ar?'اسم المشروع إنجليزي':'Project name English'}<input value={currentBrand.project_name_en||''} onChange={e=>patchBrand('project_name_en',e.target.value)}/></label>
    <label>{ar?'اسم المالك عربي':'Owner Arabic'}<input value={currentBrand.owner_name_ar||''} onChange={e=>patchBrand('owner_name_ar',e.target.value)}/></label>
    <label>{ar?'اسم المالك إنجليزي':'Owner English'}<input value={currentBrand.owner_name_en||''} onChange={e=>patchBrand('owner_name_en',e.target.value)}/></label>
    <label>{ar?'اسم المقاول عربي':'Contractor Arabic'}<input value={currentBrand.contractor_name_ar||''} onChange={e=>patchBrand('contractor_name_ar',e.target.value)}/></label>
    <label>{ar?'اسم المقاول إنجليزي':'Contractor English'}<input value={currentBrand.contractor_name_en||''} onChange={e=>patchBrand('contractor_name_en',e.target.value)}/></label>
    <label>{ar?'شعار المالك':'Owner logo'}<input type="file" accept="image/*" onChange={e=>readLogo(e.target.files?.[0],v=>patchBrand('owner_logo_data',v))}/></label>
    <label>{ar?'شعار المقاول':'Contractor logo'}<input type="file" accept="image/*" onChange={e=>readLogo(e.target.files?.[0],v=>patchBrand('contractor_logo_data',v))}/></label>
    <label>{ar?'أعد بواسطة':'Prepared by'}<input value={currentBrand.prepared_by||''} onChange={e=>patchBrand('prepared_by',e.target.value)}/></label>
    <label>{ar?'راجع بواسطة':'Reviewed by'}<input value={currentBrand.reviewed_by||''} onChange={e=>patchBrand('reviewed_by',e.target.value)}/></label>
    <label>{ar?'اعتمد بواسطة':'Approved by'}<input value={currentBrand.approved_by||''} onChange={e=>patchBrand('approved_by',e.target.value)}/></label>
    <label>Report Prefix<input value={currentBrand.report_prefix||'FM'} onChange={e=>patchBrand('report_prefix',e.target.value.toUpperCase())}/></label>
   </div>
   <button className="btn primary" style={{marginTop:12}} disabled={loading} onClick={saveBrand}>{ar?'حفظ الهوية':'Save branding'}</button>
  </div>}

  {report&&<div ref={printRef}><ReportDocument report={report} brand={currentBrand} reportType={reportType} start={start} end={end} ar={ar}/></div>}

  <div className="facility-panel no-print" style={{marginTop:16}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
    <div><h2 style={{marginBottom:4}}>{ar?'التقارير السابقة':'Previous Reports'}</h2><small>{ar?'تظهر جميع التقارير المؤرشفة مباشرة، ويمكن تضييقها باختيار عقد.':'All archived reports appear immediately; choose a contract to filter.'}</small></div>
    <select value={archiveFilter} onChange={e=>setArchiveFilter(e.target.value)}>
     <option value="all">{ar?'كل الحالات':'All statuses'}</option>
     <option value="final">{ar?'معتمد':'Final'}</option>
     <option value="printed">{ar?'تمت الطباعة':'Printed'}</option>
     <option value="sent">{ar?'تم الإرسال':'Sent'}</option>
     <option value="acknowledged">{ar?'تم الاستلام':'Acknowledged'}</option>
    </select>
   </div>
   <div style={{overflowX:'auto',marginTop:10}}>
   <table className="or-table"><thead><tr>
    <th>{ar?'رقم التقرير':'Report No.'}</th><th>{ar?'النوع':'Type'}</th><th>{ar?'الفترة':'Period'}</th>
    <th>{ar?'المراجعة':'Rev'}</th><th>{ar?'الحالة':'Status'}</th><th>{ar?'آخر طباعة':'Last print'}</th>
    <th>{ar?'الإرسال':'Sent'}</th><th>{ar?'إجراءات':'Actions'}</th>
   </tr></thead>
   <tbody>{filteredArchives.length?filteredArchives.map(x=>{
    const [label,color]=distLabel(x.distribution_status||'final',ar)
    return <tr key={x.id}>
     <td><b>{x.report_number}</b></td><td>{x.report_type}</td><td>{x.period_start} — {x.period_end}</td><td>{x.revision}</td>
     <td><span className="or-badge" style={{background:color}}>{label}</span></td>
     <td>{x.print_count||0} ×<br/><small>{dateTimeFmt(x.last_printed_at)}</small></td>
     <td>{x.sent_to||'—'}<br/><small>{dateTimeFmt(x.sent_at)}</small></td>
     <td><div className="or-actions">
      <button className="btn" onClick={()=>previewArchived(x)}>{ar?'فتح التقرير':'Open'}</button>
      <button className="btn" onClick={()=>openHistory(x)}>{ar?'السجل':'History'}</button>
      <button className="btn" disabled={loading} onClick={()=>printArchived(x)}>{ar?'طباعة التقرير':'Print'}</button>
      <button className="btn" disabled={loading} onClick={()=>{setSendRun(x);setSendTo(x.sent_to||'')}}>{ar?'تسجيل إرسال':'Mark Sent'}</button>
      {(x.distribution_status==='sent'||x.sent_at)&&!x.acknowledged_at&&<button className="btn" disabled={loading} onClick={()=>acknowledge(x)}>{ar?'تم الاستلام':'Acknowledge'}</button>}
     </div></td>
    </tr>
   }):<tr><td colSpan="8">{ar?'لا توجد تقارير مؤرشفة حتى الآن.':'No archived reports yet.'}</td></tr>}</tbody></table></div>
  </div>

  {archivePreview&&<div className="no-print">
   <div className="archive-preview-head"><h2>{ar?'معاينة التقرير السابق':'Archived Report Preview'} — {archivePreview.report_number}</h2><div style={{display:'flex',gap:8}}><button className="btn primary" onClick={()=>printArchived(archivePreview)}>{ar?'طباعة التقرير فقط':'Print Report Only'}</button><button className="btn" onClick={()=>setArchivePreview(null)}>{ar?'إغلاق':'Close'}</button></div></div>
  </div>}
  {archivePreview&&<div ref={archivePrintRef}><ArchivedReportDocument run={archivePreview} ar={ar}/></div>}

  {selectedRun&&<div className="or-dialog-backdrop no-print" onClick={()=>setSelectedRun(null)}>
   <div className="or-dialog" onClick={e=>e.stopPropagation()}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12}}><h2>{selectedRun.report_number}</h2><button className="btn" onClick={()=>setSelectedRun(null)}>×</button></div>
    <div className="or-kpis">
     <Kpi l={ar?'الحالة':'Status'} v={distLabel(selectedRun.distribution_status||'final',ar)[0]}/>
     <Kpi l={ar?'مرات الطباعة':'Print count'} v={selectedRun.print_count||0}/>
     <Kpi l={ar?'آخر طباعة':'Last print'} v={dateTimeFmt(selectedRun.last_printed_at)}/>
     <Kpi l={ar?'أرسل إلى':'Sent to'} v={selectedRun.sent_to||'—'}/>
    </div>
    <h3>{ar?'سجل الإجراءات':'Audit History'}</h3>
    <div className="or-history">{events.length?events.map(e=><div key={e.id} className="or-history-item"><b>{titleCase(e.action)}</b> — {dateTimeFmt(e.created_at)}{e.recipient&&<div>{ar?'إلى: ':'To: '}{e.recipient}</div>}{e.notes&&<div>{e.notes}</div>}</div>):<div>—</div>}</div>
   </div>
  </div>}

  {sendRun&&<div className="or-dialog-backdrop no-print" onClick={()=>setSendRun(null)}>
   <div className="or-dialog" onClick={e=>e.stopPropagation()}>
    <h2>{ar?'تسجيل إرسال التقرير':'Mark Report as Sent'}</h2><p>{sendRun.report_number}</p>
    <label>{ar?'أرسل إلى (اسم/بريد/جهة)':'Sent to (name/email/entity)'}<input value={sendTo} onChange={e=>setSendTo(e.target.value)}/></label>
    <label>{ar?'ملاحظات':'Notes'}<textarea rows="3" value={sendNotes} onChange={e=>setSendNotes(e.target.value)}/></label>
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button className="btn" onClick={()=>setSendRun(null)}>{ar?'إلغاء':'Cancel'}</button><button className="btn primary" disabled={loading||!sendTo.trim()} onClick={sendArchived}>{ar?'تأكيد الإرسال':'Confirm Sent'}</button></div>
   </div>
  </div>}
 </section>
}

function reportTitle(ar,type){
 const x={weekly:['التقرير الأسبوعي لصيانة الأجهزة الطبية','Weekly Medical Equipment Maintenance Report'],monthly:['التقرير الشهري لصيانة الأجهزة الطبية','Monthly Medical Equipment Maintenance Report'],annual:['التقرير السنوي لصيانة الأجهزة الطبية','Annual Medical Equipment Maintenance Report']}
 return x[type]?.[ar?0:1]||x.monthly[ar?0:1]
}
function reportFromRun(run){
 const s=run.snapshot||{}
 return {
  metrics:s.metrics||{},
  woStatus:s.woStatus||[],
  ppmStatus:s.ppmStatus||[],
  woPriority:s.woPriority||[],
  labels:s.labels||{contract:run.report_number},
  wo:s.wo||[],
  ppm:s.ppm||[]
 }
}
function ArchivedReportDocument({run,ar}){
 const brand=run.branding_snapshot||{}
 const report=reportFromRun(run)
 return <ReportDocument report={report} brand={brand} reportType={run.report_type} start={run.period_start} end={run.period_end} ar={ar} archived/>
}
function ReportDocument({report,brand,reportType,start,end,ar,archived=false}){
 const m=report.metrics||{}
 const summary=ar
  ?`خلال الفترة من ${start} إلى ${end} تم تسجيل ${m.totalWO??0} أمر عمل، أُغلق منها ${m.completedWO??0} بنسبة إنجاز ${m.woClosure??0}%. بلغت نسبة الالتزام بالصيانة الوقائية ${m.ppmCompliance??0}%، مع ${m.overduePPM??0} مهمة PPM متأخرة و${m.overdueWO??0} أمر عمل متأخر.`
  :`During ${start} to ${end}, ${m.totalWO??0} work orders were recorded and ${m.completedWO??0} were completed, giving a ${m.woClosure??0}% closure rate. PPM compliance was ${m.ppmCompliance??0}%, with ${m.overduePPM??0} overdue PPM jobs and ${m.overdueWO??0} overdue work orders.`
 const maxStatus=Math.max(1,...(report.woStatus||[]).map(x=>x[1]))
 return <div className="owner-report-document">
  <div className="or-cover" style={{borderTop:`8px solid ${brand.primary_color||'#0b2b4b'}`}}>
   <div className="or-logos">
    <div className="or-logo">{brand.owner_logo_data?<img src={brand.owner_logo_data} alt="Owner logo"/>:<div style={{height:95}}/>}<div><b>{ar?brand.owner_name_ar:brand.owner_name_en}</b></div></div>
    <div className="or-logo">{brand.contractor_logo_data?<img src={brand.contractor_logo_data} alt="Contractor logo"/>:<div style={{height:95}}/>}<div><b>{ar?brand.contractor_name_ar:brand.contractor_name_en}</b></div></div>
   </div>
   <div className="or-title"><h1>{reportTitle(ar,reportType)}</h1><h2>{ar?brand.project_name_ar:brand.project_name_en}</h2><p>{report.labels?.contract||'—'}</p></div>
   <div className="or-meta">
    <div><span>{ar?'الفترة':'Period'}</span><b>{start} — {end}</b></div>
    <div><span>{ar?'المالك':'Owner'}</span><b>{ar?brand.owner_name_ar:brand.owner_name_en}</b></div>
    <div><span>{ar?'المقاول':'Contractor'}</span><b>{ar?brand.contractor_name_ar:brand.contractor_name_en}</b></div>
    <div><span>{ar?'رقم العقد':'Contract'}</span><b>{report.labels?.contract||'—'}</b></div>
    <div><span>Revision</span><b>00</b></div>
   </div>
  </div>

  <div className="or-section"><h2>{ar?'الملخص التنفيذي':'Executive Summary'}</h2><div className="facility-panel"><p>{summary}</p>{archived&&!report.wo?.length&&!report.ppm?.length&&<small>{ar?'هذا تقرير قديم تم أرشفته قبل حفظ تفاصيل أوامر العمل؛ مؤشرات الأداء محفوظة ومتاحة.':'This older archive predates detailed WO/PPM snapshots; its KPI snapshot is still available.'}</small>}</div></div>
  <div className="or-section"><h2>{ar?'مؤشرات الأداء الرئيسية':'Key Performance Indicators'}</h2>
   <div className="or-kpis">
    <Kpi l={ar?'أوامر العمل':'Work Orders'} v={m.totalWO??0}/><Kpi l={ar?'نسبة الإغلاق':'WO Closure'} v={(m.woClosure??0)+'%'} tone={pctTone(m.woClosure??0)}/>
    <Kpi l={ar?'PPM المنفذة':'PPM Completed'} v={`${m.completedPPM??0}/${m.totalPPM??0}`}/><Kpi l={ar?'التزام PPM':'PPM Compliance'} v={(m.ppmCompliance??0)+'%'} tone={pctTone(m.ppmCompliance??0)}/>
    <Kpi l={ar?'WO متأخرة':'Overdue WO'} v={m.overdueWO??0}/><Kpi l={ar?'PPM متأخرة':'Overdue PPM'} v={m.overduePPM??0}/>
    <Kpi l={ar?'أصول حرجة':'Critical Assets'} v={m.criticalAssets??0}/><Kpi l="SLA" v={m.slaRate==null?'N/A':m.slaRate+'%'} tone={m.slaRate==null?null:pctTone(m.slaRate)}/>
   </div>
  </div>

  {!!(report.woStatus||[]).length&&<div className="or-section"><h2>{ar?'توزيع أوامر العمل':'Work Order Distribution'}</h2><div className="facility-panel or-chart">
   {report.woStatus.map(([k,v])=><div className="or-bar" key={k}><span>{titleCase(k)}</span><div><i style={{width:`${Math.max(3,Math.round(v/maxStatus*100))}%`}}/></div><b>{v}</b></div>)}
  </div></div>}

  {!!report.wo?.length&&<div className="or-section"><h2>{ar?'الأعمال التصحيحية':'Corrective Maintenance'}</h2><ReportTable rows={report.wo.slice(0,30)} cols={[
   ['work_order_number',ar?'رقم أمر العمل':'WO No.'],['title',ar?'العنوان':'Title'],['priority',ar?'الأولوية':'Priority'],['status',ar?'الحالة':'Status'],['due_date',ar?'الاستحقاق':'Due']
  ]}/></div>}
  {!!report.ppm?.length&&<div className="or-section"><h2>{ar?'الصيانة الوقائية':'Preventive Maintenance'}</h2><ReportTable rows={report.ppm.slice(0,30)} cols={[
   ['job_number',ar?'رقم المهمة':'Job No.'],['title',ar?'العنوان':'Title'],['status',ar?'الحالة':'Status'],['due_date',ar?'الاستحقاق':'Due']
  ]}/></div>}

  <div className="or-signatures"><div><b>{ar?'أعد بواسطة':'Prepared by'}</b><br/>{safe(brand.prepared_by)}</div><div><b>{ar?'راجع بواسطة':'Reviewed by'}</b><br/>{safe(brand.reviewed_by)}</div><div><b>{ar?'اعتمد بواسطة':'Approved by'}</b><br/>{safe(brand.approved_by)}</div></div>
 </div>
}
function Kpi({l,v,tone}){return <div className="or-kpi"><span>{l}</span><strong style={tone?{color:tone}:null}>{v}</strong></div>}
function ReportTable({rows,cols}){return <div className="facility-panel" style={{overflowX:'auto'}}><table className="or-table"><thead><tr>{cols.map(c=><th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i}>{cols.map(c=><td key={c[0]}>{c[0].includes('date')?dateFmt(r[c[0]]):safe(r[c[0]])}</td>)}</tr>):<tr><td colSpan={cols.length}>—</td></tr>}</tbody></table></div>}
