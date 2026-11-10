import {useEffect,useMemo,useRef,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {readOwnerLogo} from '../lib/ownerLogo'
import {ownerLogoSource} from '../lib/ownerLogo'
import {useAuth} from '../context/AuthContext'
import {ownerReportPeriod} from '../lib/ownerReportModel'
import {displayReportValue} from '../lib/reportDisplay'
import {useLanguage} from '../i18n/LanguageContext'
import {
 loadOwnerReportDirectory,loadBranding,saveBranding,loadOwnerReportData,archiveOwnerReport,loadArchivedReports,
 markReportPrinted,markReportSent,markReportAcknowledged,loadReportEvents
} from '../lib/ownerReports'

const titleCase=s=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())
const dateFmt=v=>displayReportValue(v,'due_date','ar')
const dateTimeFmt=v=>displayReportValue(v,'generated_at','ar')
const safe=v=>v==null||v===''?'—':v
const periodFor=ownerReportPeriod
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
 const {access,can}=useAuth()
 const [activeOrganization,setActiveOrganization]=useState(()=>localStorage.getItem('basmat.active.organization')||'')
 const organizationId=access?.super_admin?activeOrganization:(access?.home_organization?.organization_id||access?.home_organization?.id||'')
 const [reportMode,setReportMode]=useState('contract'),[ownerId,setOwnerId]=useState('')
 useEffect(()=>{const changed=e=>setActiveOrganization(e.detail?.organization_id||'');window.addEventListener('basmat-organization-changed',changed);return()=>window.removeEventListener('basmat-organization-changed',changed)},[])
 const printRef=useRef(null),archivePrintRef=useRef(null)
 const [directory,setDirectory]=useState(null)
 const [contractId,setContractId]=useState('')
 const [reportType,setReportType]=useState('monthly')
 const [[start,end],setPeriod]=useState(periodFor('monthly'))
 const [report,setReport]=useState(null),[branding,setBranding]=useState(null),[archives,setArchives]=useState([])
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('')
 const [editBrand,setEditBrand]=useState(false)
 const [ownerLogoDraft,setOwnerLogoDraft]=useState(null),[editingOwnerLogo,setEditingOwnerLogo]=useState(false)
 useEffect(()=>{setEditingOwnerLogo(false);setOwnerLogoDraft(null)},[ownerId,contractId,organizationId])
 const [archiveFilter,setArchiveFilter]=useState('all')
 const [selectedRun,setSelectedRun]=useState(null),[events,setEvents]=useState([])
 const [sendRun,setSendRun]=useState(null),[sendTo,setSendTo]=useState(''),[sendNotes,setSendNotes]=useState('')
 const [archivePreview,setArchivePreview]=useState(null)
 const [archiveAvailable,setArchiveAvailable]=useState(false)
 const [archiveError,setArchiveError]=useState(''),[brandingError,setBrandingError]=useState('')
 const archiveMessage=e=>(e?.code==='42501'||/permission denied/i.test(e?.message||''))?(ar?'أرشيف التقارير غير متاح لهذا الحساب حالياً. يمكنك إنشاء التقرير ومعاينته وطباعته؛ الحفظ النهائي يحتاج إصلاح صلاحية الأرشيف في قاعدة البيانات.':'The archive is unavailable for this account. Report generation, preview and printing remain available; final saving requires archive access to be restored in the database.'):(ar?'تعذر تحميل الأرشيف. يمكنك متابعة إنشاء التقرير وطباعته.':'The archive could not be loaded. Report generation and printing remain available.')

 useEffect(()=>{
  let active=true
  loadOwnerReportDirectory().then(d=>{if(active)setDirectory(d)}).catch(e=>{if(active)setError(e.message)})
  loadArchivedReports().then(a=>{if(active){setArchives(a);setArchiveError('');setArchiveAvailable(true)}}).catch(e=>{if(active){setArchiveError(archiveMessage(e));setArchiveAvailable(false)}})
  return()=>{active=false}
 },[])
 useEffect(()=>{setPeriod(periodFor(reportType));setReport(null)},[reportType])
 useEffect(()=>{
  let active=true
  setBranding(null);setBrandingError('')
  if(!contractId)return
  loadBranding(contractId).then(data=>{if(active)setBranding(data)}).catch(()=>{if(active)setBrandingError(ar?'هوية التقرير المحفوظة غير متاحة؛ تُستخدم أسماء الجهات المسجلة.':'Saved branding is unavailable; registered organization names are used.')})
  return()=>{active=false}
 },[contractId])

 const selectedContract=useMemo(()=>directory?.contracts.find(x=>x.id===contractId),[directory,contractId])
 const owner=useMemo(()=>directory?.clients.find(x=>x.id===(reportMode==='owner'?ownerId:selectedContract?.client_id)),[directory,selectedContract,ownerId,reportMode])
 const org=useMemo(()=>directory?.organizations.find(x=>x.id===(reportMode==='owner'?organizationId:selectedContract?.organization_id)),[directory,selectedContract,organizationId,reportMode])
 useEffect(()=>{setReport(null);setContractId('');setOwnerId('')},[organizationId])
 const filteredArchives=useMemo(()=>{
  let rows=archives
  if(organizationId)rows=rows.filter(x=>x.organization_id===organizationId)
  if(reportMode==='owner'&&ownerId){const ids=new Set((directory?.contracts||[]).filter(c=>c.organization_id===organizationId&&c.client_id===ownerId).map(c=>c.id));rows=rows.filter(x=>ids.has(x.contract_id))}
  if(contractId)rows=rows.filter(x=>x.contract_id===contractId)
  if(archiveFilter!=='all')rows=rows.filter(x=>(x.distribution_status||'final')===archiveFilter)
  return rows
 },[archives,archiveFilter,contractId,organizationId,ownerId,reportMode,directory])

 const refreshArchive=async()=>{try{setArchives(await loadArchivedReports());setArchiveError('');setArchiveAvailable(true)}catch(e){setArchiveError(archiveMessage(e));setArchiveAvailable(false)}}
 const make=async()=>{
  if(reportMode==='contract'?!contractId:!ownerId||!organizationId)return
  try{setLoading(true);setError('');setSaved('');setReport(null);setReport(await loadOwnerReportData({contractId:reportMode==='contract'?contractId:null,organizationId,clientId:ownerId,start,end,lang,reportType}))}
  catch(e){setError(e.message)}finally{setLoading(false)}
 }
 const currentBrand={...{
  organization_id:selectedContract?.organization_id,contract_id:contractId,
  project_name_ar:selectedContract?.name_ar||report?.labels?.client||'',project_name_en:selectedContract?.name_en||report?.labels?.client||'',
  owner_name_ar:owner?.name_ar||owner?.name||'',owner_name_en:owner?.name_en||owner?.name||'',
  contractor_name_ar:org?.name_ar||org?.name||'',contractor_name_en:org?.name_en||org?.name||'',
  owner_logo_data:'',contractor_logo_data:'',primary_color:'#0b2b4b',secondary_color:'#b8892d',
  prepared_by:'',reviewed_by:'',approved_by:'',report_prefix:'MED'
 },...(branding||{}),owner_logo_data:ownerLogoSource(owner?.logo_url)||ownerLogoSource(branding?.owner_logo_data),contractor_logo_data:ownerLogoSource(org?.logo_url)||ownerLogoSource(branding?.contractor_logo_data)}
 const saveSharedOwnerLogo=async()=>{
  if(!owner?.id||!organizationId||ownerLogoDraft===null)return
  try{
   setLoading(true);setError('')
   const {data,error}=await supabase.from('bf_clients').update({logo_url:ownerLogoSource(ownerLogoDraft)||null}).eq('id',owner.id).eq('organization_id',organizationId).select('id,logo_url').single()
   if(error)throw error
   setDirectory(d=>({...d,clients:d.clients.map(c=>c.id===data.id?{...c,logo_url:data.logo_url}:c)}))
   setOwnerLogoDraft(null);setEditingOwnerLogo(false)
   setSaved(ar?'تم حفظ شعار المالك لجميع المخرجات الجديدة.':'Owner logo saved for all new outputs.')
  }catch(e){setError(e.message)}finally{setLoading(false)}
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
  if(!report?.contract||!archiveAvailable)return
  try{
   setLoading(true);setError('')
   const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,12)
   const reportNumber=`${currentBrand.report_prefix||'MED'}-${reportType.toUpperCase()}-${stamp}`
   const snapshot={
    ...report,metrics:report.metrics,woStatus:report.woStatus,ppmStatus:report.ppmStatus,woPriority:report.woPriority,labels:report.labels,
    wo:report.wo,ppm:report.ppm,reportType,start,end
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
   .owner-report-document{font-family:Tahoma,Arial,sans-serif;color:#18324b}.owner-report-document p{line-height:1.85}.owner-report-document thead{display:table-header-group}.owner-report-document tr{break-inside:avoid}
   .or-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
   .or-cover{min-height:0;gap:24px;display:flex;flex-direction:column;justify-content:space-between;padding:24px;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(145deg,#fff,#f8fafc)}
   .or-logos{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.or-logo{text-align:center}.or-logo img{max-width:190px;max-height:95px;object-fit:contain}
   .or-title{text-align:center;margin:60px 0}.or-title h1{font-size:32px;color:#0b2b4b;margin:0}.or-title h2{font-size:18px;margin:12px 0;color:#475569}
   .or-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 28px;font-size:12px}.or-meta div{display:flex;justify-content:space-between;border-bottom:1px solid #e5e7eb;padding:7px 0}
   .or-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.or-kpi{padding:15px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.or-kpi span{font-size:10px;color:#64748b;display:block}.or-kpi strong{font-size:24px;color:#0b2b4b}
   .or-chart{display:grid;gap:7px}.or-bar{display:grid;grid-template-columns:130px 1fr 40px;gap:8px;align-items:center;font-size:11px}.or-bar i{height:10px;background:#0b2b4b;border-radius:6px;display:block}
   .or-table{width:100%;border-collapse:collapse}.or-table th,.or-table td{font-size:12px;padding:7px;border-bottom:1px solid #edf1f5;text-align:start;vertical-align:top}
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
    body.owner-report-print-mode .owner-report-print-target .or-section{break-inside:auto!important}
    @page{size:A4 landscape;margin:12mm}
   }
  `}</style>

  <div className="page-head"><div><h1>{ar?'مركز تقارير المالك للأجهزة الطبية':'Medical Owner Reporting Center'}</h1><p>{ar?'تقارير صيانة الأجهزة الطبية الأسبوعية والشهرية والسنوية مع الأرشيف وتتبع الطباعة والإرسال.':'Weekly, monthly and annual medical-equipment maintenance reports with archive and report-only printing.'}</p></div></div>
  {error&&<div className="facility-panel" style={{color:'#b42318'}}>{error}</div>}
  {editingOwnerLogo&&<div className="facility-panel no-print"><h3>{ar?'شعار المالك للتقارير والجواز والتاق والمستندات':'Owner logo for reports, passports, tags and documents'}</h3><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{try{const file=e.target.files?.[0];if(file)setOwnerLogoDraft(await readOwnerLogo(file))}catch(e){setError(e.message)}}}/>{ownerLogoSource(ownerLogoDraft)&&<img src={ownerLogoSource(ownerLogoDraft)} alt={ar?'معاينة الشعار':'Logo preview'} style={{display:'block',width:100,height:70,objectFit:'contain',margin:10}}/>}<div className="row-actions"><button className="btn primary" disabled={loading||ownerLogoDraft===null} onClick={saveSharedOwnerLogo}>{ar?'حفظ شعار المالك':'Save owner logo'}</button><button className="btn" onClick={()=>setOwnerLogoDraft('')}>{ar?'إزالة':'Remove'}</button><button className="btn" onClick={()=>setEditingOwnerLogo(false)}>{ar?'إلغاء':'Cancel'}</button></div></div>}
  {brandingError&&<p className="muted no-print" role="status">{brandingError}</p>}
  {archiveError&&<div className="facility-panel no-print" role="status" style={{borderInlineStart:'4px solid #f28c28',color:'#735521'}}>{archiveError}</div>}
  {saved&&<div className="facility-panel" style={{color:'#067647'}}>{saved}</div>}

  <div className="facility-panel no-print">
   <div className="or-controls">
    <label>{ar?'نطاق التقرير':'Report scope'}<select value={reportMode} onChange={e=>{setReportMode(e.target.value);setContractId('');setOwnerId('');setReport(null)}}><option value="contract">{ar?'عقد محدد':'Specific contract'}</option><option value="owner">{ar?'كل أعمال المالك لدى الشركة':'All owner work at this company'}</option></select></label>
    {reportMode==='contract'?<label>{ar?'العقد والمالك':'Contract and owner'}<select value={contractId} onChange={e=>{setContractId(e.target.value);setReport(null)}}><option value="">{ar?'اختر العقد':'Select contract'}</option>{directory?.contracts.filter(c=>!organizationId||c.organization_id===organizationId).map(c=><option key={c.id} value={c.id}>{c.contract_number||c.number||c.code||'—'} — {directory.clients.find(o=>o.id===c.client_id)?.name||'—'}</option>)}</select></label>:<label>{ar?'الجهة المالكة':'Owner'}<select value={ownerId} disabled={!organizationId} onChange={e=>{setOwnerId(e.target.value);setReport(null)}}><option value="">{ar?'اختر المالك للشركة الحالية':'Select an owner at the current company'}</option>{directory?.clients.filter(c=>c.organization_id===organizationId).map(c=><option key={c.id} value={c.id}>{c.name||c.name_ar||c.code}</option>)}</select></label>}
    <label>{ar?'نوع التقرير':'Report type'}<select value={reportType} onChange={e=>setReportType(e.target.value)}><option value="weekly">{ar?'أسبوعي':'Weekly'}</option><option value="monthly">{ar?'شهري':'Monthly'}</option><option value="annual">{ar?'سنوي':'Annual'}</option></select></label>
    <label>{ar?'من':'From'}<input type="date" value={start} onChange={e=>{setPeriod([e.target.value,end]);setReport(null)}}/></label>
    <label>{ar?'إلى':'To'}<input type="date" value={end} onChange={e=>{setPeriod([start,e.target.value]);setReport(null)}}/></label>
   </div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
    <button className="btn primary" disabled={(reportMode==='contract'?!contractId:!ownerId||!organizationId)||loading} onClick={make}>{loading?(ar?'جاري التحميل...':'Loading...'):(ar?'إنشاء التقرير':'Generate report')}</button>
    {owner?.id&&can('clients.manage',organizationId)&&<button className="btn" onClick={()=>{setOwnerLogoDraft(owner.logo_url||'');setEditingOwnerLogo(!editingOwnerLogo)}}>{ar?'شعار المالك العام':'Shared owner logo'}</button>}
    <button className="btn" disabled={!contractId} onClick={()=>setEditBrand(!editBrand)}>{ar?'هوية التقرير':'Report branding'}</button>
    {report&&<><button className="btn" onClick={printCurrent}>{ar?'طباعة التقرير فقط / PDF':'Print Report Only / PDF'}</button><button className="btn" disabled={loading||!report.contract||!archiveAvailable} title={!report.contract?(ar?'الأرشفة النهائية متاحة لتقرير عقد محدد':'Final archiving requires a specific contract'):undefined} onClick={archive}>{ar?'اعتماد وأرشفة':'Finalize & Archive'}</button></>}
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
    <label>Report Prefix<input value={currentBrand.report_prefix||'MED'} onChange={e=>patchBrand('report_prefix',e.target.value.toUpperCase())}/></label>
   </div>
   <button className="btn primary" style={{marginTop:12}} disabled={loading} onClick={saveBrand}>{ar?'حفظ الهوية':'Save branding'}</button>
  </div>}

  {reportMode==='owner'&&<p className="muted no-print">{ar?'يشمل عقود المالك والأعمال غير المرتبطة بعقد داخل الشركة الحالية. يمكن طباعته؛ الأرشفة النهائية تتطلب اختيار عقد محدد.':'Includes the owner’s contracts and work without a contract at the current company. Printing is available; final archiving requires a specific contract.'}</p>}
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
   }):<tr><td colSpan="8">{archiveError?(ar?'تعذر قراءة الأرشيف؛ هذه الحالة لا تعني عدم وجود تقارير محفوظة.':'The archive is unavailable; this does not mean no saved reports exist.'):(ar?'لا توجد تقارير مؤرشفة حتى الآن.':'No archived reports yet.')}</td></tr>}</tbody></table></div>
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
  ...s,
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
export function ReportDocument({report,brand,reportType,start,end,ar,archived=false}){
 const m=report.metrics||{}
 const percent=v=>v==null?(ar?'غير متاح':'N/A'):v+'%'
 const summary=!m.totalWO&&!m.totalPPM
  ?(ar?'لا توجد أعمال متاحة لهذا الحساب ضمن النطاق والفترة المختارين. لا يمكن اعتبار ذلك نسبة إنجاز صفرية. راجع العقد أو اختر «كل أعمال المالك لدى الشركة» لإدراج أعماله غير المرتبطة بعقد.':'No work is available to this account for the selected scope and period. This does not represent a zero completion rate. Check the contract or select all owner work to include work without a contract.')
  :(ar?`خلال الفترة ${start} — ${end} سُجل ${m.totalWO??'—'} أمر عمل؛ أُنجز فنياً ${m.completedWO??'—'} وأُغلق ${m.closedWO??'—'}، بنسبة إغلاق ${percent(m.woClosure)} بعد استبعاد الملغى. سُجلت ${m.totalPPM??'—'} مهمة وقائية للفترة، ونسبة تنفيذ المهام المستحقة حتى ${report.asOf||end} هي ${percent(m.ppmCompliance)}. رصيد الأعمال المفتوحة يشمل ${m.openWO??'—'} أمر عمل، منها ${m.overdueWO??'—'} متأخر.`:`During ${start} — ${end}, ${m.totalWO??'—'} work orders were recorded; ${m.completedWO??'—'} were technically completed and ${m.closedWO??'—'} closed (${percent(m.woClosure)}). There are ${m.totalPPM??'—'} preventive jobs in the period; execution of jobs due by ${report.asOf||end} is ${percent(m.ppmCompliance)}. The open backlog is ${m.openWO??'—'}, including ${m.overdueWO??'—'} overdue work orders.`)
 const maxStatus=Math.max(1,...(report.woStatus||[]).map(x=>x[1]))
 return <div className="owner-report-document">
  <div className="or-cover" style={{borderTop:`8px solid ${brand.primary_color||'#0b2b4b'}`}}>
   <div className="or-logos">
    <div className="or-logo">{brand.owner_logo_data?<img src={brand.owner_logo_data} alt="Owner logo"/>:<div style={{height:12}}/>}<div><b>{ar?brand.owner_name_ar:brand.owner_name_en}</b></div></div>
    <div className="or-logo">{brand.contractor_logo_data?<img src={brand.contractor_logo_data} alt="Contractor logo"/>:<div style={{height:12}}/>}<div><b>{ar?brand.contractor_name_ar:brand.contractor_name_en}</b></div></div>
   </div>
   <div className="or-title"><h1>{reportTitle(ar,reportType)}</h1><h2>{ar?brand.project_name_ar:brand.project_name_en}</h2><p>{report.labels?.contract||'—'}</p></div>
   <div className="or-meta">
    <div><span>{ar?'الفترة':'Period'}</span><b><bdi dir="ltr">{start} — {end}</bdi></b></div>
    <div><span>{ar?'المالك':'Owner'}</span><b>{ar?brand.owner_name_ar:brand.owner_name_en}</b></div>
    <div><span>{ar?'المقاول':'Contractor'}</span><b>{ar?brand.contractor_name_ar:brand.contractor_name_en}</b></div>
    <div><span>{ar?'رقم العقد':'Contract'}</span><b>{report.labels?.contract||'—'}</b></div>
    <div><span>{ar?'نطاق البيانات':'Data scope'}</span><b>{report.labels?.organization} · {report.labels?.client}</b></div><div><span>{ar?'المراجعة':'Revision'}</span><b>00</b></div>
   </div>
  </div>

  <div className="or-section"><h2>{ar?'الملخص التنفيذي':'Executive Summary'}</h2><div className="facility-panel"><p>{summary}</p>{archived&&!report.wo?.length&&!report.ppm?.length&&<small>{ar?'هذا تقرير قديم تم أرشفته قبل حفظ تفاصيل أوامر العمل؛ مؤشرات الأداء محفوظة ومتاحة.':'This older archive predates detailed WO/PPM snapshots; its KPI snapshot is still available.'}</small>}</div></div>
  <div className="or-section"><h2>{ar?'مؤشرات الأداء الرئيسية':'Key Performance Indicators'}</h2>
   <div className="or-kpis">
    <Kpi l={ar?'أوامر العمل':'Work Orders'} v={m.totalWO??'—'}/><Kpi l={ar?'نسبة الإغلاق':'WO Closure'} v={percent(m.woClosure)} tone={m.woClosure==null?null:pctTone(m.woClosure)}/>
    <Kpi l={ar?'PPM المنفذة':'PPM Completed'} v={`${m.completedPPM??0}/${m.totalPPM??0}`}/><Kpi l={ar?'تنفيذ الوقائية المستحقة':'Due PPM execution'} v={percent(m.ppmCompliance)} tone={m.ppmCompliance==null?null:pctTone(m.ppmCompliance)}/>
    <Kpi l={ar?'WO متأخرة':'Overdue WO'} v={m.overdueWO??'—'}/><Kpi l={ar?'PPM متأخرة':'Overdue PPM'} v={m.overduePPM??'—'}/>
    <Kpi l={ar?'أصول حرجة':'Critical Assets'} v={m.criticalAssets??'—'}/><Kpi l="SLA" v={m.slaRate==null?(ar?'غير متاح':'N/A'):m.slaRate+'%'} tone={m.slaRate==null?null:pctTone(m.slaRate)}/>
   </div>
  </div>

  {!!(report.woStatus||[]).length&&<div className="or-section"><h2>{ar?'توزيع أوامر العمل':'Work Order Distribution'}</h2><div className="facility-panel or-chart">
   {report.woStatus.map(([k,v])=><div className="or-bar" key={k}><span>{titleCase(k)}</span><div><i style={{width:`${Math.max(3,Math.round(v/maxStatus*100))}%`}}/></div><b>{v}</b></div>)}
  </div></div>}

  {!!report.wo?.length&&<div className="or-section"><h2>{ar?'تفاصيل أوامر العمل':'Work order details'}</h2><ReportTable rows={report.wo} cols={[
   ['work_order_number',ar?'رقم أمر العمل':'WO No.'],['title',ar?'العنوان':'Title'],['asset_label',ar?'الجهاز':'Device'],['serial_number',ar?'السيريال':'Serial'],['site_name',ar?'الموقع':'Site'],['priority',ar?'الأولوية':'Priority'],['status',ar?'الحالة':'Status'],['due_date',ar?'الاستحقاق':'Due']
  ]}/></div>}
  {!!report.ppm?.length&&<div className="or-section"><h2>{ar?'الصيانة الوقائية':'Preventive Maintenance'}</h2><ReportTable rows={report.ppm} cols={[
   ['job_number',ar?'رقم المهمة':'Job No.'],['asset_label',ar?'الجهاز':'Device'],['site_name',ar?'الموقع':'Site'],['status',ar?'الحالة':'Status'],['due_date',ar?'الاستحقاق':'Due']
  ]}/></div>}

  <OwnerReportInsights report={report} ar={ar} reportType={reportType}/>
  <div className="facility-panel" style={{marginTop:20,fontSize:12,color:'#617587'}}><b>{ar?'نطاق ومنهج التقرير':'Report scope and basis'}</b><p>{ar?'أوامر العمل حسب تاريخ الإنشاء، والوقائية حسب تاريخ الاستحقاق. يُستبعد الملغى من مقام نسبة الإغلاق ومن الوقائية. التحليل حسب السجلات المتاحة للحساب؛ الحالة المعروضة حالية وليست لقطة تاريخية لنهاية الفترة. المتأخرات تشمل الرصيد السابق. النسب غير متاحة عند غياب المقام؛ ولا يُفترض وجود خطط أو مهام غير مسجلة.':'Work orders use creation date; preventive work uses due date and excludes cancellations. Cancelled work orders are excluded from the closure denominator. Analysis uses records available to this account. Statuses are current, not historical period-end snapshots. Overdue work includes earlier backlog. Ratios are unavailable with no denominator; missing schedules or jobs are not inferred.'}</p><p>{ar?'صدر في':'Generated'}: {displayReportValue(report.generatedAt,'generated_at',ar?'ar':'en')}</p></div>
  <div className="or-signatures"><div><b>{ar?'أعد بواسطة':'Prepared by'}</b><br/>{safe(brand.prepared_by)}</div><div><b>{ar?'راجع بواسطة':'Reviewed by'}</b><br/>{safe(brand.reviewed_by)}</div><div><b>{ar?'اعتمد بواسطة':'Approved by'}</b><br/>{safe(brand.approved_by)}</div></div>
 </div>
}
function Kpi({l,v,tone}){return <div className="or-kpi"><span>{l}</span><strong style={tone?{color:tone}:null}>{v}</strong></div>}
function ReportTable({rows,cols}){
 const {lang}=useLanguage(),ar=lang==='ar'
 const statuses={draft:'مسودة',assigned:'مسند',accepted:'مقبول',in_progress:'قيد التنفيذ',on_hold:'متوقف',completed:'منجز فنياً',approved:'معتمد',closed:'مغلق',cancelled:'ملغى',scheduled:'مجدول',in_service:'في الخدمة',out_of_service:'خارج الخدمة',unknown:'غير مسجل',P1:'حرجة',P2:'عالية',P3:'متوسطة',P4:'منخفضة'}
 const cell=(row,key)=>{
  const value=row[key]
  if(ar&&statuses[value]&&['status','operational_status','priority'].includes(key))return statuses[value]
  if(/(_date|_at)$/.test(key))return displayReportValue(value,key,lang)
  return safe(value)
 }
 return <div className="facility-panel" style={{overflowX:'auto'}}><table className="or-table"><thead><tr>{cols.map(c=><th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i}>{cols.map(c=><td key={c[0]}>{cell(r,c[0])}</td>)}</tr>):<tr><td colSpan={cols.length}>{ar?'لا توجد سجلات في البيانات المحملة لهذا البند.':'No records were returned for this item.'}</td></tr>}</tbody></table></div>
}
function OwnerReportInsights({report,ar,reportType}){
 if(report.metrics?.totalWO===0&&report.metrics?.totalPPM===0&&!report.backlog?.length&&!report.assets?.length&&!report.upcoming?.length)return <p className="facility-panel">{ar?'لا تتوفر سجلات كافية للتحليل ضمن هذا النطاق. اختر العقد الصحيح أو نطاق جميع أعمال المالك، ثم أعد إنشاء التقرير.':'There are insufficient records to analyze this scope. Select the correct contract or all owner work, then regenerate the report.'}</p>
 if(!report.trend)return <p className="muted">{ar?'هذه النسخة المؤرشفة لا تتضمن التحليلات التفصيلية الجديدة.':'This archived version does not contain the newer detailed analysis.'}</p>
 const section=(title,content)=><div className="or-section"><h2>{title}</h2>{content}</div>
 const refCols=[['work_order_number',ar?'أمر العمل':'Work order'],['asset_label',ar?'الجهاز':'Device'],['site_name',ar?'الموقع':'Site'],['status',ar?'الحالة':'Status'],['due_date',ar?'الاستحقاق':'Due']]
 const dueCols=[['job_number',ar?'مهمة الوقائية':'PPM job'],['asset_label',ar?'الجهاز':'Device'],['site_name',ar?'الموقع':'Site'],['due_date',ar?'الاستحقاق':'Due']]
 const overdue=[...(report.overdueWO||[]).map(r=>({...r,reference:r.work_order_number,kind:ar?'أمر عمل':'Work order'})),...(report.overduePPM||[]).map(r=>({...r,reference:r.job_number,kind:ar?'وقائية':'Preventive'}))]
 const followup=[]
 if(report.metrics.criticalWO)followup.push(ar?`متابعة ${report.metrics.criticalWO} أمر عمل مفتوح بأولوية حرجة مع المشرف.`:`Follow up ${report.metrics.criticalWO} critical open work orders with the supervisor.`)
 if(overdue.length)followup.push(ar?`تحديد موعد إغلاق ومسؤول متابعة لكل بند من ${overdue.length} بنداً متأخراً موضحاً أدناه.`:`Assign a target closure date and follow-up owner for each of the ${overdue.length} overdue items below.`)
 if(report.held?.length)followup.push(ar?'مراجعة أسباب توقف العمل المسجلة وإزالة العوائق مع الجهة المختصة.':'Review recorded hold reasons and resolve blockers with the responsible party.')
 if(report.awaitingClose?.length)followup.push(ar?'استكمال المراجعات والاعتمادات المطلوبة للأعمال المنجزة فنياً قبل إغلاقها.':'Complete the required reviews and acceptance steps for technically completed work before closure.')
 if(report.warranty?.length)followup.push(ar?'مراجعة تواريخ انتهاء الضمان المبينة في التقرير قبل تكليف صيانة خارج نطاقه.':'Review the warranty expiry dates before authorizing service outside warranty coverage.')
 return <>
  {section(ar?(reportType==='weekly'?'الإنجاز اليومي خلال الأسبوع':reportType==='annual'?'حصيلة الأداء حسب شهور السنة':'اتجاه الإنجاز خلال أسابيع الفترة'):(reportType==='weekly'?'Daily results for the week':reportType==='annual'?'Monthly results for the year':'Weekly results within the period'),<><ReportTable rows={report.trend} cols={[["period",ar?'الفترة':'Period'],['work_orders',ar?'أوامر عمل مسجلة':'Recorded work orders'],['closed',ar?'مغلقة حالياً':'Currently closed'],['ppm_due',ar?'وقائية مجدولة':'Scheduled PPM'],['ppm_done',ar?'وقائية منفذة':'Executed PPM']]}/><p className="muted">{ar?'كل صف يجمع الأعمال وفق تاريخ إنشائها أو استحقاقها؛ الإغلاق حسب الحالة الحالية.':'Rows group work by creation or due date; closure uses current status.'}</p></>)}
  {section(ar?'المتأخرات التي تتطلب متابعة':'Overdue work requiring follow-up',<ReportTable rows={overdue} cols={[["reference",ar?'المرجع':'Reference'],['kind',ar?'النوع':'Type'],['asset_label',ar?'الجهاز':'Device'],['site_name',ar?'الموقع':'Site'],['due_date',ar?'الاستحقاق':'Due']]}/>)}
  {section(ar?'الأعمال المتوقفة وأسبابها المسجلة':'Work on hold and recorded reasons',<ReportTable rows={report.held||[]} cols={[...refCols,['hold_reason',ar?'سبب التوقف المسجل':'Recorded hold reason']]}/>)}
  {section(ar?'أعمال منجزة فنياً ولم تُغلق':'Technically completed work awaiting closure',<ReportTable rows={report.awaitingClose||[]} cols={refCols}/>)}
  {section(ar?(reportType==='weekly'?'خطة الأسبوع التالي المسجلة':reportType==='annual'?'الوقائية المسجلة للفترة التالية':'خطة الشهر التالي المسجلة'):'Recorded preventive work for the next period',<><ReportTable rows={report.upcoming||[]} cols={dueCols}/><p className="muted">{ar?'تُعرض المهام المولدة فعلياً فقط؛ عدم وجود مهام لا يثبت اكتمال خطة الصيانة.':'Only generated jobs are shown. No jobs does not establish that scheduling is complete.'}</p></>)}
  {reportType!=='weekly'&&section(ar?'أكثر الأجهزة تكراراً لطلبات العمل — أعلى 10':'Devices with repeated work orders — top 10',<><ReportTable rows={report.repeatedAssets||[]} cols={[["asset_label",ar?'الجهاز':'Device'],['serial_number',ar?'السيريال':'Serial'],['site_name',ar?'الموقع':'Site'],['count',ar?'طلبات غير وقائية':'Non-PPM work orders']]}/><p className="muted">{ar?'التكرار مؤشر للمتابعة، وليس تشخيصاً فنياً أو قياساً للاعتمادية. تُستبعد أوامر العمل المرتبطة بمهام الوقائية من هذا الجدول.':'Repeat work is a follow-up signal, not a diagnosis or a reliability measure. Work orders linked to PPM jobs are excluded.'}</p></>)}
  {section(ar?'الأجهزة المشمولة بالنطاق وتواريخ الضمان':'Devices within scope and warranty dates',<><div className="or-kpis"><Kpi l={ar?'الأجهزة المسجلة بالنطاق':'Recorded devices in scope'} v={report.metrics.assets}/><Kpi l={ar?'الأجهزة الحرجة':'Critical devices'} v={report.metrics.criticalAssets}/><Kpi l={ar?'ضمان ينتهي خلال الفترة':'Warranty expiring in period'} v={report.metrics.warrantyEnding}/></div><ReportTable rows={report.warranty||[]} cols={[["asset_label",ar?'الجهاز':'Device'],['serial_number',ar?'السيريال':'Serial'],['site_name',ar?'الموقع':'Site'],['warranty_end',ar?'نهاية الضمان':'Warranty end']]}/>{reportType==='annual'&&<ReportTable rows={(report.assetStatus||[]).map(([operational_status,count])=>({operational_status,count}))} cols={[["operational_status",ar?'حالة الجهاز المسجلة':'Recorded device status'],['count',ar?'العدد':'Count']]}/>}<p className="muted">{ar?'في نطاق العقد تشمل قائمة الأجهزة ما ارتبط بأعماله أو بمواقع مسندة له. يلزم سجل تغطية تعاقدية كامل لتأكيد شمول جميع الأجهزة.':'For a contract, devices are drawn from linked work and contract-assigned sites. A full coverage register is needed to confirm every covered device.'}</p></>)}
  {section(ar?'أولويات المتابعة المقترحة للمالك':'Suggested owner follow-up priorities',<div className="facility-panel">{followup.length?<ul>{followup.map(item=><li key={item} style={{marginBottom:10}}>{item}</li>)}</ul>:<p>{ar?'لم تظهر أولويات آلية من البنود المحملة. راجع اكتمال السجلات والجدولة قبل الاعتماد.':'No automatic priorities were identified in the returned records. Review data and scheduling completeness before approval.'}</p>}</div>)}
 </>
}
