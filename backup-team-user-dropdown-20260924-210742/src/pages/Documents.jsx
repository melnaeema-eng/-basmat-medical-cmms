import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadDocuments,generateDocument,voidDocument} from '../lib/documents'
export default function Documents(){
 const {t,lang}=useLanguage()
 const [data,setData]=useState({documents:[],eligible:[]}),[type,setType]=useState('technical_report')
 const [entity,setEntity]=useState(''),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[msg,setMsg]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadDocuments({document_type:null}))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const eligible=(data.eligible||[]).filter(x=>x.document_type===type)
 const create=async e=>{e.preventDefault();const x=eligible.find(v=>v.entity_id===entity);if(!x)return
  setBusy(true);setError('');setMsg('')
  try{await generateDocument(type,x.entity_type,x.entity_id,title);setEntity('');setTitle('');setMsg(t('documentCreated'));await load()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const voidIt=async d=>{const reason=prompt(t('documentVoidReason'));if(!reason)return
  setBusy(true);setError('');try{await voidDocument(d.id,reason);setMsg(t('documentVoided'));await load()}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const printDoc=d=>{
  const w=window.open('','_blank');if(!w)return
  w.document.documentElement.lang=lang;w.document.documentElement.dir=lang==='ar'?'rtl':'ltr'
  w.document.write(`<title>${d.document_number}</title><style>body{font-family:Arial,sans-serif;margin:30px}h1{font-size:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:7px;text-align:start}pre{white-space:pre-wrap;overflow-wrap:anywhere}@page{size:A4;margin:15mm}</style>`)
  const safe=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
  w.document.write(`<h1>${safe(d.title)}</h1><p><b>${safe(t('documentNumber'))}:</b> ${safe(d.document_number)}</p><p><b>${safe(t('documentGenerated'))}:</b> ${safe(new Date(d.generated_at).toLocaleString(lang))}</p><p><b>${safe(t('documentHash'))}:</b> ${safe(d.snapshot_hash)}</p><pre>${safe(JSON.stringify(d.snapshot,null,2))}</pre>`)
  if(d.document_type==='approval_certificate')w.document.write(`<p>${safe(t('documentNotSignature'))}</p>`)
  w.document.close();w.focus();setTimeout(()=>w.print(),200)
 }
 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('documentCenter')}</h1><p className="muted">{t('documentImmutable')}</p></div><button className="btn secondary" onClick={load} disabled={busy}>{t('documentRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}{msg&&<div className="facility-panel">{msg}</div>}
  <form className="facility-panel" onSubmit={create}>
   <h2>{t('documentGenerate')}</h2>
   <div className="form-grid">
    <label>{t('documentType')}<select value={type} onChange={e=>{setType(e.target.value);setEntity('')}}><option value="technical_report">{t('documentTechnical')}</option><option value="approval_certificate">{t('documentCertificate')}</option></select></label>
    <label>{t('documentEntity')}<select required value={entity} onChange={e=>setEntity(e.target.value)}><option value="">{t('documentSelect')}</option>{eligible.map(x=><option key={x.entity_type+x.entity_id} value={x.entity_id}>{x.reference} — {x.title}</option>)}</select></label>
    <label>{t('documentTitle')}<input maxLength={250} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   </div>
   <button className="btn primary" disabled={busy||!entity}>{t('documentGenerate')}</button>
  </form>
  <div className="facility-panel">
   <h2>{t('documents')}</h2>
   {!data.documents?.length?<p>{t('documentNoData')}</p>:data.documents.map(d=><article className="facility-panel" key={d.id} style={{marginBlock:10}}>
    <div className="page-head"><div><strong>{d.document_number} — {d.title}</strong><p className="muted">{d.client_name} / {d.site_name}</p></div><strong>{d.status==='final'?t('documentFinal'):t('documentVoid')}</strong></div>
    <p>{new Date(d.generated_at).toLocaleString(lang)}</p>
    <div className="row-actions"><button className="btn primary" type="button" onClick={()=>printDoc(d)}>{t('documentPrint')}</button>{d.can_manage&&d.status==='final'&&<button className="btn secondary" type="button" onClick={()=>voidIt(d)}>{t('documentVoid')}</button>}</div>
   </article>)}
  </div>
 </section>
}
