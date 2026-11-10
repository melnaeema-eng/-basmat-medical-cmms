import {loadOwnerIdentity} from '../lib/ownerIdentity'
import {printReport} from '../lib/reportExport'
import OwnerBrand,{useOwnerIdentity} from '../components/OwnerBrand'
import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadDocumentControl,createControlledDocument,addDocumentRevision,archiveControlledDocument} from '../lib/documentControl'
import {supabase} from '../lib/supabaseClient'

const types=['drawing','om_manual','warranty','certificate','method_statement','datasheet','policy','procedure','other']

export default function DocumentControl(){
 const {t,lang}=useLanguage()
 const [data,setData]=useState({documents:[],summary:{}})
 const [directory,setDirectory]=useState({orgs:[],clients:[],sites:[],assets:[]})
 const [form,setForm]=useState({organization_id:'',client_id:'',site_id:'',asset_id:'',document_type:'drawing',title:'',discipline:'general',expiry_date:''})
 const [rev,setRev]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadDocumentControl())}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load();Promise.all([
  supabase.from('bf_organizations').select('id,name').eq('status','active'),
  supabase.from('bf_clients').select('id,organization_id,name').eq('status','active'),
  supabase.from('bf_sites').select('id,organization_id,client_id,name').eq('status','active'),
  supabase.from('bf_assets').select('id,organization_id,client_id,site_id,asset_tag,name_ar,name_en').eq('status','active')
 ]).then(rs=>setDirectory({orgs:rs[0].data||[],clients:rs[1].data||[],sites:rs[2].data||[],assets:rs[3].data||[]}))},[])
 const ownerIdentity=useOwnerIdentity({organizationId:form.organization_id,clientId:form.client_id,siteId:form.site_id,assetId:form.asset_id})
 const save=async e=>{e.preventDefault();try{setBusy(true);await createControlledDocument(form);setForm(v=>({...v,title:'',expiry_date:''}));await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const saveRev=async e=>{e.preventDefault();try{setBusy(true);await addDocumentRevision(rev);setRev(null);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const printCover=async document=>{
  const popup=window.open('','_blank')
  if(!popup){setError(lang==='ar'?'اسمح بالنوافذ المنبثقة للطباعة.':'Allow pop-ups to print.');return}
  try{
   const identity=await loadOwnerIdentity({organizationId:document.organization_id,clientId:document.client_id,siteId:document.site_id,assetId:document.asset_id})
   const columns=['document_number','title','document_type','current_revision','current_issue_date','file_name']
   const labels=lang==='ar'?{document_number:'رقم المستند',title:'العنوان',document_type:'النوع',current_revision:'الإصدار',current_issue_date:'تاريخ الإصدار',file_name:'المرفق'}:{document_number:'Document number',title:'Title',document_type:'Type',current_revision:'Revision',current_issue_date:'Issue date',file_name:'Attachment'}
   printReport({owner_identity:identity,context:{organization_name:directory.orgs.find(o=>o.id===document.organization_id)?.name||'',client_name:identity?.name||document.client_name,site_name:document.site_name},generated_at:new Date().toLocaleString(lang),rows:[document]},columns,labels,lang==='ar'?'غلاف المستند':'Document cover',lang,popup)
  }catch(e){popup.close();setError(e.message)}
 }
 const archive=async id=>{try{setBusy(true);await archiveControlledDocument(id);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const s=data.summary||{}
 return <section className="facility-module">
  <div className="page-head"><h1>{t('documentControlTitle')}</h1><button className="btn secondary" onClick={load}>{t('dcRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="stats-grid facility-stats">{[['dcTotal',s.total],['dcActive',s.active],['dcArchived',s.archived],['dcExpiring',s.expiring_60],['dcNoRevision',s.without_revision]].map(([k,v])=><div className="stat-card" key={k}><span>{t(k)}</span><strong>{v??0}</strong></div>)}</div>
  <OwnerBrand identity={ownerIdentity} lang={lang}/>
  <form className="facility-panel" onSubmit={save}><h2>{t('dcNew')}</h2><div className="form-grid">
   <label>Organization<select required value={form.organization_id} onChange={e=>setForm(v=>({...v,organization_id:e.target.value,client_id:'',site_id:'',asset_id:''}))}><option value="">—</option>{directory.orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('dcClient')}<select required value={form.client_id} onChange={e=>setForm(v=>({...v,client_id:e.target.value,site_id:'',asset_id:''}))}><option value="">—</option>{directory.clients.filter(x=>!form.organization_id||x.organization_id===form.organization_id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('dcSite')}<select value={form.site_id} onChange={e=>setForm(v=>({...v,site_id:e.target.value,asset_id:''}))}><option value="">—</option>{directory.sites.filter(x=>!form.client_id||x.client_id===form.client_id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('dcAsset')}<select value={form.asset_id} onChange={e=>setForm(v=>({...v,asset_id:e.target.value}))}><option value="">—</option>{directory.assets.filter(x=>!form.site_id||x.site_id===form.site_id).map(x=><option key={x.id} value={x.id}>{x.asset_tag} — {x.name_ar||x.name_en}</option>)}</select></label>
   <label>{t('dcType')}<select value={form.document_type} onChange={e=>setForm(v=>({...v,document_type:e.target.value}))}>{types.map(x=><option key={x}>{x}</option>)}</select></label>
   <label>{t('dcTitle')}<input required minLength={3} value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
   <label>{t('dcDiscipline')}<input value={form.discipline} onChange={e=>setForm(v=>({...v,discipline:e.target.value}))}/></label>
   <label>{t('dcExpiry')}<input type="date" value={form.expiry_date} onChange={e=>setForm(v=>({...v,expiry_date:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy}>{t('dcAdd')}</button></form>
  {rev&&<form className="facility-panel" onSubmit={saveRev}><h2>{t('dcAddRevision')}</h2><div className="form-grid">
   <label>{t('dcRevision')}<input required value={rev.revision} onChange={e=>setRev(v=>({...v,revision:e.target.value}))}/></label>
   <label>{t('dcIssueDate')}<input type="date" value={rev.issue_date} onChange={e=>setRev(v=>({...v,issue_date:e.target.value}))}/></label>
   <label>{t('dcDescription')}<input value={rev.description} onChange={e=>setRev(v=>({...v,description:e.target.value}))}/></label>
   <label>{t('dcFileName')}<input value={rev.file_name} onChange={e=>setRev(v=>({...v,file_name:e.target.value}))}/></label>
   <label>{t('dcFileUrl')}<input value={rev.file_url} onChange={e=>setRev(v=>({...v,file_url:e.target.value}))}/></label>
  </div><button className="btn primary">{t('dcSave')}</button></form>}
  <div className="facility-panel">{!data.documents?.length?<p>{t('dcNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('dcNumber')}</th><th>{t('dcClient')}</th><th>{t('dcSite')}</th><th>{t('dcType')}</th><th>{t('dcTitle')}</th><th>{t('dcRevision')}</th><th>{t('dcExpiry')}</th><th>{t('dcStatus')}</th><th></th></tr></thead><tbody>{data.documents.map(d=><tr key={d.id}><td>{d.document_number}</td><td>{d.client_name}</td><td>{d.site_name||'—'}</td><td>{d.document_type}</td><td>{d.title}</td><td>{d.current_revision}</td><td>{d.expiry_date||'—'}</td><td>{d.status}</td><td><button type="button" className="btn xs secondary" onClick={()=>printCover(d)}>{lang==='ar'?'غلاف بشعار المالك':'Owner-branded cover'}</button> <button className="btn xs secondary" onClick={()=>setRev({document_id:d.id,revision:'',description:'',issue_date:new Date().toISOString().slice(0,10),file_name:'',file_url:''})}>{t('dcAddRevision')}</button> {d.status!=='archived'&&<button className="btn xs danger-soft" onClick={()=>archive(d.id)}>{t('dcArchive')}</button>}</td></tr>)}</tbody></table></div>}</div>
 </section>
}
