import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {Field,Select,Notice} from '../components/FacilityFields'
import {reportScopes,reportQuery,reportExport,reportSections,reportColumns,reportDefinitions,percentage,formatValue} from '../lib/reporting'
import {exportXlsx,printReport,printCurrentReport} from '../lib/reportExport'

const labels={overview:'reportOverview',work_orders:'reportWorkOrders',ppm:'reportPPM',technicians:'reportTechnicians',materials:'reportMaterials',monthly:'reportMonthly',quality:'reportQuality'}
const today=()=>new Date().toISOString().slice(0,10)
const defaultStart=()=>{const d=new Date();d.setUTCDate(d.getUTCDate()-89);return d.toISOString().slice(0,10)}
export default function ManagementReports({capabilities}){
 const {t,lang}=useLanguage()
 const [scopes,setScopes]=useState(null),[filters,setFilters]=useState({organization_id:'',client_id:'',site_id:'',start_date:defaultStart(),end_date:today()})
 const [section,setSection]=useState('overview'),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(0),[page,setPage]=useState(0)
 const [applied,setApplied]=useState(null)
 useEffect(()=>{
  let active=true
  reportScopes().then(s=>{
   if(!active)return
   setScopes(s)
   const first=s.organizations?.[0]?.id
   if(first){
    const next={organization_id:first,client_id:'',site_id:'',start_date:defaultStart(),end_date:today()}
    setFilters(next);setApplied(next);setBusy(true)
    reportQuery(next,'overview',200,0).then(data=>{if(active)setResult(data)})
     .catch(e=>{if(active)setError(e.message)})
     .finally(()=>{if(active)setBusy(false)})
   }else setError(t('reportNoPermission'))
  }).catch(e=>{if(active)setError(e.message)})
  return()=>{active=false}
 },[])
 const org=filters.organization_id
 const clients=(scopes?.clients||[]).filter(c=>c.organization_id===org)
 const sites=(scopes?.sites||[]).filter(s=>s.organization_id===org&&(!filters.client_id||s.client_id===filters.client_id))
 const options=(items,all=true)=>[...(all?[{value:'',label:t('reportAll')}]:[]),...items.map(x=>({value:x.id,label:x.name}))]
 const set=(key,value)=>setFilters(f=>({...f,[key]:value,...(key==='organization_id'?{client_id:'',site_id:''}:key==='client_id'?{site_id:''}:{})}))
 const valid=()=>{
  if(!org)throw Error(t('reportSelect'))
  const a=Date.parse(filters.start_date+'T00:00:00Z'),b=Date.parse(filters.end_date+'T00:00:00Z')
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||(b-a)/86400000>366)throw Error(t('reportLimits'))
 }
 const fetchReport=async(nextSection=section,nextPage=0,values=applied||filters)=>{
  setBusy(true);setError('')
  try{
   const data=await reportQuery(values,nextSection,200,nextPage*200)
   setResult(data);setSection(nextSection);setPage(nextPage)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const apply=async e=>{e.preventDefault();try{valid();const next={...filters};setApplied(next);await fetchReport(section,0,next)}catch(e){setError(e.message)}}
 const changeSection=next=>{setSection(next);setResult(null);if(applied)fetchReport(next,0)}
 const columns=useMemo(()=>section==='overview'?Object.keys(result?.totals||{}).filter(k=>k!=='report_limitations'):reportColumns[section]||[],[section,result])
 const displayCols=columns.filter(k=>section!=='materials'||result?.totals?.cost_available||!['unit_cost','actual_cost'].includes(k))
 const labelsFor=Object.fromEntries(displayCols.map(c=>[c,t(c)]))
 const label=c=>labelsFor[c]===c?c.replaceAll('_',' '):labelsFor[c]
 const title=t(labels[section])
 const selectedContext=values=>{
  const orgItem=(scopes?.organizations||[]).find(x=>x.id===values?.organization_id)
  const clientItem=(scopes?.clients||[]).find(x=>x.id===values?.client_id)
  const siteItem=(scopes?.sites||[]).find(x=>x.id===values?.site_id)
  return {
   organization_name:orgItem?.name||'—',
   client_name:clientItem?.name||t('reportAll'),
   site_name:siteItem?.name||t('reportAll')
  }
 }
 const exportData=async(kind)=>{
  if(!applied||!capabilities?.organizations?.some(o=>o.id===applied.organization_id&&o.can_export))return
  setExporting(true);setProgress(0);setError('')
  try{
   const data=await reportExport(applied,section,setProgress)
   data.definition=t('reportDef'+section.charAt(0).toUpperCase()+section.slice(1).replace(/_([a-z])/g,(_,c)=>c.toUpperCase()))
   const cols=section==='overview'?Object.keys(data.totals).filter(k=>k!=='report_limitations'):reportColumns[section].filter(k=>section!=='materials'||data.totals.cost_available||!['unit_cost','actual_cost'].includes(k))
   const context=selectedContext(applied)
   const report=section==='overview'
    ? {...data,context,rows:cols.map(key=>({metric:t(key),value:data.totals[key]}))}
    : {...data,context}
   const exportedCols=section==='overview'?['metric','value']:cols
   const names=Object.fromEntries(exportedCols.map(c=>[c,label(c)]))
   const filename='Basmat-'+section+'-'+applied.start_date+'-'+applied.end_date
   if(kind==='xlsx')exportXlsx(report,exportedCols,names,filename)
   else printReport(report,exportedCols,names,title,lang)
  }catch(e){setError(e.message)}finally{setExporting(false)}
 }
 const totals=result?.totals||{}
 const cards=section==='overview'?[
  ['reportCreated',totals.work_orders],['reportOpen',totals.open_work_orders],['reportClosed',totals.closed_work_orders],
  ['reportSla',totals.sla_breached],['reportDue',totals.ppm_due],
  ['reportCompliance',percentage(totals.ppm_closed,totals.ppm_due)===null?'—':percentage(totals.ppm_closed,totals.ppm_due)+'%'],
  ['reportLabor',((Number(totals.labor_minutes)||0)/60).toLocaleString(lang,{maximumFractionDigits:1})+' '+t('reportHours')]
 ]:[]
 const rows=section==='overview'?[]:result?.rows||[]
 const canExport=!!capabilities?.organizations?.some(o=>o.id===applied?.organization_id&&o.can_export)
 const printCurrent=()=>{
  if(!result||!applied)return
  const cols=section==='overview'?Object.keys(result.totals||{}).filter(k=>k!=='report_limitations'):displayCols
  const names=section==='overview'
   ? Object.fromEntries(cols.map(c=>[c,label(c)]))
   : Object.fromEntries(cols.map(c=>[c,label(c)]))
  const context=selectedContext(applied)
  const report=section==='overview'
   ? {...result,context,rows:cols.map(key=>({metric:label(key),value:result.totals?.[key]}))}
   : {...result,context,rows:rows}
  const outCols=section==='overview'?['metric','value']:cols
  const outNames=section==='overview'?{metric:t('reportMetric'),value:t('reportValue')}:names
  printCurrentReport(report,outCols,outNames,title,lang)
 }
 const technicianSummary=section==='technicians'?totals.technicians||[]:[]
 const monthlyMax=section==='monthly'?Math.max(1,...rows.map(x=>Number(x.created)||0)):1
 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('reports')}</h1><p className="muted">{t('reportSnapshot')}</p></div></div>
  <Notice error={error}/>
  <form className="facility-panel" onSubmit={apply}>
   <div className="form-grid">
    <Field label={t('reportCompany')} required><Select required value={org} onChange={v=>set('organization_id',v)} options={options(scopes?.organizations||[],false)}/></Field>
    <Field label={t('reportClient')}><Select value={filters.client_id} onChange={v=>set('client_id',v)} options={options(clients)}/></Field>
    <Field label={t('reportSite')}><Select value={filters.site_id} onChange={v=>set('site_id',v)} options={options(sites)}/></Field>
    <Field label={t('reportStart')} required><input required type="date" value={filters.start_date} onChange={e=>set('start_date',e.target.value)}/></Field>
    <Field label={t('reportEnd')} required><input required type="date" value={filters.end_date} onChange={e=>set('end_date',e.target.value)}/></Field>
   </div>
   <div className="row-actions"><button className="btn primary" disabled={busy||!org}>{t('reportApply')}</button></div>
  </form>
  <div className="row-actions" style={{flexWrap:'wrap'}}>
   {reportSections.map(key=><button type="button" key={key} className={'btn '+(section===key?'primary':'secondary')} onClick={()=>changeSection(key)}>{t(labels[key])}</button>)}
  </div>
  {result&&<div className="facility-panel">
   <div className="page-head"><div><h2>{title}</h2><p className="muted">{applied.start_date} — {applied.end_date} · {t('reportGenerated')}: {new Date(result.generated_at).toLocaleString(lang)}</p></div>
    <div className="row-actions">
     <button type="button" className="btn primary" disabled={busy} onClick={printCurrent}>{t('reportPrint')}</button>
     <button type="button" className="btn primary" disabled={exporting||busy||!canExport} title={!canExport?t('reportExportPermission'):''} onClick={()=>exportData('xlsx')}>{t('reportExportExcel')}</button>
     <button type="button" className="btn primary" disabled={exporting||busy||!canExport} title={!canExport?t('reportExportPermission'):''} onClick={()=>exportData('pdf')}>{t('reportExportPDF')}</button>
    </div>
   </div>
   {exporting&&<p role="status">{t('reportExporting')} {progress} {t('reportRows')}</p>}
   <p className="muted">{t('reportDefinition')}: {t('reportDef'+section.charAt(0).toUpperCase()+section.slice(1).replace(/_([a-z])/g,(_,c)=>c.toUpperCase()))}</p>
   {section==='monthly'&&rows.length>0&&<div className="facility-panel">
    <h3>{t('reportMonthly')}</h3>
    {rows.map(m=><div key={m.month} style={{display:'grid',gridTemplateColumns:'90px 1fr 55px',alignItems:'center',gap:12,marginBlock:8}}>
     <span>{m.month}</span><div style={{height:16,background:'var(--surface-secondary,#e5e7eb)',borderRadius:4,overflow:'hidden'}}>
      <div style={{height:'100%',width:(Number(m.created)/monthlyMax*100)+'%',background:'#64748b'}}/>
     </div><strong>{m.created}</strong>
    </div>)}
    <p className="muted">{t('reportCreated')}</p>
   </div>}
   {section==='technicians'&&technicianSummary.length>0&&<div className="facility-panel">
    <h3>{t('reportTechnicians')}</h3>
    <div style={{overflowX:'auto'}}><table className="facility-table" style={{width:'100%'}}>
     <thead><tr><th>{t('technician')}</th><th>{t('reportLabor')}</th><th>{t('fieldVisits')}</th><th>{t('reportWorkOrders')}</th></tr></thead>
     <tbody>{technicianSummary.map(x=><tr key={x.technician_id}><td>{x.full_name||x.technician_id}</td><td>{formatValue(Number(x.minutes)/60,lang)} {t('reportHours')}</td><td>{x.visits}</td><td>{x.work_orders}</td></tr>)}</tbody>
    </table></div>
   </div>}
   {section==='overview'?<>
    <div className="stats-grid facility-stats">{cards.map(([key,value])=><div className="stat-card" key={key}><span>{t(key)}</span><strong>{formatValue(value,lang)}</strong></div>)}</div>
    <div className="facility-panel"><h3>{t('reportOverview')}</h3>
     {Object.entries(totals).filter(([key])=>key!=='report_limitations').map(([key,value])=><div className="row-actions" key={key} style={{justifyContent:'space-between',padding:'6px 0'}}><span>{label(key)}</span><strong>{formatValue(value,lang)}</strong></div>)}
    </div>
   </>:<>
    <p>{t('reportTotal')}: {totals.count??0} · {t('reportPage')}: {page+1}</p>
    <div style={{overflowX:'auto'}}><table className="facility-table" style={{width:'100%',borderCollapse:'collapse'}}>
     <thead><tr>{displayCols.map(c=><th key={c} style={{padding:8,textAlign:'start',borderBottom:'1px solid #ccc'}}>{label(c)}</th>)}</tr></thead>
     <tbody>{rows.map((row,i)=><tr key={row.id||row.month||i}>{displayCols.map(c=><td key={c} style={{padding:8,borderBottom:'1px solid #ddd'}}>
      {c==='work_order_number'&&row.work_order_id?<Link to={'/corrective/work_order/'+row.work_order_id}>{row[c]}</Link>:formatValue(row[c],lang)}
     </td>)}</tr>)}</tbody>
    </table></div>
    {!rows.length&&<p>{t('reportNoData')}</p>}
    <div className="row-actions">
     <button type="button" className="btn secondary" disabled={busy||page===0} onClick={()=>fetchReport(section,page-1)}>{t('reportPrevious')}</button>
     <span>{page+1}</span>
     <button type="button" className="btn secondary" disabled={busy||!result.has_more} onClick={()=>fetchReport(section,page+1)}>{t('reportNext')}</button>
    </div>
   </>}
   {section==='materials'&&<p className="muted">{t('reportCostNotice')}</p>}
   <p className="muted">{t('reportLimits')}</p>
  </div>}
  {!result&&!busy&&<p className="muted">{t('reportApply')}</p>}
  {busy&&<p role="status">{t('loading')}</p>}
 </section>
}
