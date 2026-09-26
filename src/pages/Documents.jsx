import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadDocuments,generateDocument,voidDocument} from '../lib/documents'
import {supabase} from '../lib/supabaseClient'

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const fmt=(value,locale='en')=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):esc(d.toLocaleString(locale))}
const statusText=v=>v==null||v===''?'—':String(v).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())

function sectionRows(s){
 if(s?.source==='ppm_job')return [['Reference',s.number],['Status',statusText(s.status)],['Client',s.client_name],['Site / Facility',s.site_name],['Asset ID',s.asset_id],['Due date',s.due_date],['Started',s.started_at],['Completed',s.completed_at],['Approved',s.approved_at],['Closed',s.closed_at]]
 if(s?.source==='work_order')return [['Work Order',s.number],['Title',s.title],['Status',statusText(s.status)],['Priority',s.priority],['Approval',statusText(s.approval_status)],['SLA',statusText(s.sla_status)],['Client',s.client_name],['Site / Facility',s.site_name],['Created',s.created_at],['Assigned',s.assigned_at],['Started',s.started_at],['Completed',s.completed_at],['Closed',s.closed_at]]
 if(s?.source==='approval')return [['Reference',s.source_reference],['Subject',s.subject],['Reviewer type',statusText(s.reviewer_type)],['Round',s.round],['Client',s.client_name],['Site / Facility',s.site_name],['Requested by',s.requested_by],['Requested at',s.requested_at],['Decided by',s.decided_by],['Decided at',s.decided_at]]
 return []
}

function detailBlocks(s){
 if(s?.source==='work_order')return [['Description',s.description],['Diagnosis',s.diagnosis],['Root cause',s.root_cause],['Work performed',s.work_performed],['Tests performed',s.tests_performed],['Recommendations',s.recommendations]]
 if(s?.source==='approval')return [['Request comment',s.request_comment],['Decision comment',s.decision_comment]]
 return []
}

export default function Documents(){
 const {t,lang}=useLanguage()
 const [data,setData]=useState({documents:[],eligible:[]}),[type,setType]=useState('technical_report')
 const [entity,setEntity]=useState(''),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[msg,setMsg]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadDocuments({document_type:null}))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const eligible=(data.eligible||[]).filter(x=>x.document_type===type)
 const create=async e=>{e.preventDefault();const x=eligible.find(v=>v.entity_id===entity);if(!x)return;setBusy(true);setError('');setMsg('');try{await generateDocument(type,x.entity_type,x.entity_id,title);setEntity('');setTitle('');setMsg(t('documentCreated'));await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const voidIt=async d=>{const reason=prompt(t('documentVoidReason'));if(!reason)return;setBusy(true);setError('');try{await voidDocument(d.id,reason);setMsg(t('documentVoided'));await load()}catch(e){setError(e.message)}finally{setBusy(false)}}

 const printDoc=async d=>{
  const w=window.open('','_blank');if(!w)return
  const reportLang=d.document_type==='technical_report'?'en':lang
  const direction=reportLang==='ar'?'rtl':'ltr'
  const snap=d.snapshot||{}
  let org=null
  try{const {data:row}=await supabase.from('bf_organizations').select('id,name,name_ar,name_en,logo_url').eq('id',d.organization_id).maybeSingle();org=row||null}catch(_){org=null}
  const orgName=reportLang==='ar'?(org?.name_ar||org?.name||org?.name_en||'Organization'):(org?.name_en||org?.name||org?.name_ar||'Organization')
  const basmatLogo=window.location.origin+'/bafm-logo.png'
  const orgLogo=org?.logo_url||''
  const rows=sectionRows(snap)
  const details=detailBlocks(snap)
  const results=Array.isArray(snap.results)?snap.results:[]
  const metaHtml=rows.map(([k,v])=>`<div class="meta-item"><div class="meta-label">${esc(k)}</div><div class="meta-value">${/(date|started|completed|approved|closed|created|assigned|at)$/i.test(k)?fmt(v,reportLang):esc(v??'—')}</div></div>`).join('')
  const detailHtml=details.filter(([,v])=>v!=null&&String(v).trim()!=='').map(([k,v])=>`<section class="detail-block"><h3>${esc(k)}</h3><div>${esc(v)}</div></section>`).join('')
  const resultHtml=results.length?`<section class="section"><h2>PPM Checklist Results</h2><table><thead><tr><th>#</th><th>Step</th><th>Result</th><th>Reading</th><th>Comment</th></tr></thead><tbody>${results.map((r,i)=>`<tr><td>${i+1}</td><td><strong>${esc(r.title_en||r.title_ar||('Step '+(i+1)))}</strong><small>${esc(r.step_id||'')}</small></td><td><span class="result ${esc(String(r.result||'').toLowerCase())}">${esc(statusText(r.result))}</span></td><td>${esc(r.reading??'—')}</td><td>${esc(r.comment||'—')}</td></tr>`).join('')}</tbody></table></section>`:''
  const workSummary=snap.source==='work_order'?`<section class="section"><h2>Execution Summary</h2><div class="stats"><div><span>Labor</span><strong>${esc(snap.labor_minutes??0)} min</strong></div><div><span>Evidence</span><strong>${esc(snap.evidence_count??0)}</strong></div></div></section>`:''
  const approvalNote=d.document_type==='approval_certificate'?`<div class="notice">${esc(t('documentNotSignature'))}</div>`:''
  const html=`<!doctype html><html lang="${reportLang}" dir="${direction}"><head><meta charset="utf-8"><title>${esc(d.document_number)} - ${esc(d.title)}</title><style>
*{box-sizing:border-box}html{background:#edf2f5}body{font-family:Arial,"Segoe UI",sans-serif;color:#17232b;margin:0;padding:24px}.paper{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:14mm;box-shadow:0 4px 24px rgba(0,0,0,.10)}.brand{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:3px solid #263f4b;padding-bottom:14px}.brand-side{display:flex;align-items:center;gap:12px;min-width:0}.brand img{max-height:58px;max-width:145px;object-fit:contain}.org-fallback{width:58px;height:58px;border:1px solid #d7dfe3;display:grid;place-items:center;font-weight:700;border-radius:8px}.brand-text strong{display:block;font-size:17px}.brand-text span{font-size:11px;color:#68767e}.doc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin:24px 0 18px}.doc-head h1{font-size:27px;margin:0 0 6px}.doc-head p{margin:0;color:#61717a}.doc-no{text-align:end}.doc-no strong{display:block;font-size:17px}.doc-no span{font-size:11px;color:#68767e}.meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid #d9e0e4;border-radius:10px;overflow:hidden;margin:15px 0 20px}.meta-item{padding:10px 12px;border-bottom:1px solid #e6ecef}.meta-item:nth-child(odd){border-inline-end:1px solid #e6ecef}.meta-label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#718087;margin-bottom:3px}.meta-value{font-size:13px;font-weight:600;overflow-wrap:anywhere}.section{margin:22px 0}.section h2{font-size:17px;margin:0 0 10px;border-inline-start:4px solid #263f4b;padding-inline-start:9px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f1f5f7;text-align:start;font-size:10px;text-transform:uppercase}th,td{border:1px solid #d9e1e5;padding:8px;vertical-align:top}td small{display:block;margin-top:4px;color:#8b979d;font-size:8px;overflow-wrap:anywhere}.result{font-weight:700}.result.pass{color:#246336}.result.fail{color:#9f2e2e}.result.na{color:#69777e}.detail-block{margin:12px 0;border:1px solid #dfe6e9;border-radius:8px;padding:12px}.detail-block h3{font-size:12px;margin:0 0 6px;color:#53656e}.detail-block div{white-space:pre-wrap;font-size:12px;line-height:1.5}.stats{display:flex;gap:12px}.stats>div{border:1px solid #dfe6e9;border-radius:8px;padding:10px 14px;min-width:120px}.stats span{display:block;font-size:10px;color:#718087}.stats strong{display:block;margin-top:4px}.notice{margin:16px 0;padding:10px;border:1px solid #dfe6e9;background:#f7f9fa;font-size:11px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:34px}.signature{min-height:74px;border-top:1px solid #8c999f;padding-top:7px;font-size:10px;color:#61717a}.footer{display:flex;justify-content:space-between;gap:10px;border-top:1px solid #e1e7ea;margin-top:30px;padding-top:10px;font-size:8px;color:#7c898f;overflow-wrap:anywhere}.toolbar{position:fixed;top:12px;right:12px;z-index:10}.toolbar button{padding:9px 14px;border:0;border-radius:7px;background:#263f4b;color:#fff;cursor:pointer}@media print{html,body{background:#fff}.toolbar{display:none}.paper{box-shadow:none;margin:0;width:auto;min-height:auto;padding:0}body{padding:0}@page{size:A4;margin:12mm}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save PDF</button></div><main class="paper"><header class="brand"><div class="brand-side"><img src="${esc(basmatLogo)}" alt="Basmat Alnawabigh"><div class="brand-text"><strong>Basmat Alnawabigh</strong><span>CMMS Technical Documentation</span></div></div><div class="brand-side">${orgLogo?`<img src="${esc(orgLogo)}" alt="${esc(orgName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`:''}<div class="org-fallback" style="display:${orgLogo?'none':'grid'}">${esc(orgName.slice(0,2).toUpperCase())}</div><div class="brand-text"><strong>${esc(orgName)}</strong><span>Organization</span></div></div></header><section class="doc-head"><div><h1>${esc(d.document_type==='approval_certificate'?'Approval Certificate':'Technical Report')}</h1><p>${esc(d.title)}</p></div><div class="doc-no"><strong>${esc(d.document_number)}</strong><span>${fmt(d.generated_at,reportLang)}</span></div></section><section class="meta-grid">${metaHtml}</section>${resultHtml}${workSummary}${detailHtml}${approvalNote}<section class="signatures"><div class="signature">Prepared by / أعد بواسطة</div><div class="signature">Reviewed by / راجع بواسطة</div><div class="signature">Approved by / اعتمد بواسطة</div></section><footer class="footer"><span>Immutable document snapshot</span><span>Hash: ${esc(d.snapshot_hash||'—')}</span></footer></main></body></html>`
  w.document.open();w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),350)
 }

 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('documentCenter')}</h1><p className="muted">{t('documentImmutable')}</p></div><button className="btn secondary" onClick={load} disabled={busy}>{t('documentRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}{msg&&<div className="facility-panel">{msg}</div>}
  <form className="facility-panel" onSubmit={create}>
   <h2>{t('documentGenerate')}</h2>
   <div className="form-grid">
    <label>{t('documentType')}<select value={type} onChange={e=>{setType(e.target.value);setEntity('')}}><option value="technical_report">{t('documentTechnical')}</option><option value="approval_certificate">{t('documentCertificate')}</option></select></label>
    <label>{t('documentEntity')}<select required value={entity} onChange={e=>setEntity(e.target.value)}><option value="">{t('documentSelect')}</option>{eligible.map(x=><option key={x.entity_type+x.entity_id} value={x.entity_id}>{x.reference} — {x.title}</option>)}</select></label>
    <label>{t('documentTitle')}<input name={type==='technical_report'?'title_en':'document_title'} data-lang={type==='technical_report'?'en':undefined} lang={type==='technical_report'?'en':lang} dir={type==='technical_report'?'ltr':(lang==='ar'?'rtl':'ltr')} minLength={3} maxLength={250} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   </div>
   <button className="btn primary" disabled={busy||!entity}>{t('documentGenerate')}</button>
  </form>
  <div className="facility-panel"><h2>{t('documents')}</h2>{!data.documents?.length?<p>{t('documentNoData')}</p>:data.documents.map(d=><article className="facility-panel" key={d.id} style={{marginBlock:10}}><div className="page-head"><div><strong>{d.document_number} — {d.title}</strong><p className="muted">{d.client_name} / {d.site_name}</p></div><strong>{d.status==='final'?t('documentFinal'):t('documentVoid')}</strong></div><p>{new Date(d.generated_at).toLocaleString(lang)}</p><div className="row-actions"><button className="btn primary" type="button" onClick={()=>printDoc(d)}>{t('documentPrint')}</button>{d.can_manage&&d.status==='final'&&<button className="btn secondary" type="button" onClick={()=>voidIt(d)}>{t('documentVoid')}</button>}</div></article>)}</div>
 </section>
}
