import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadSupplierPerformance,evaluateSupplier} from '../lib/supplierPerformance'

const iso=d=>d.toISOString().slice(0,10)

export default function SupplierPerformance(){
 const {t}=useLanguage()
 const today=new Date(),start=new Date(Date.now()-365*86400000)
 const [from,setFrom]=useState(iso(start)),[to,setTo]=useState(iso(today))
 const [data,setData]=useState({rows:[],summary:{},recent_evaluations:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [form,setForm]=useState({
  supplier_id:'',quality_score:'5',delivery_score:'5',service_score:'5',commercial_score:'5',
  evaluation_date:iso(today),notes:''
 })

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const x=await loadSupplierPerformance({from,to})
   setData(x)
   if(!form.supplier_id&&x.rows?.[0])setForm(v=>({...v,supplier_id:x.rows[0].id}))
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const save=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await evaluateSupplier(form)
   setForm(v=>({...v,notes:''}))
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const s=data.summary||{}
 const scoreOptions=[1,2,3,4,5]

 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('supplierPerformanceCenter')}</h1></div>
   <button className="btn secondary" onClick={load} disabled={busy}>{t('supplierPerformanceRefresh')}</button>
  </div>

  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="facility-panel">
   <div className="form-grid">
    <label>{t('supplierPerformanceFrom')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>{t('supplierPerformanceTo')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
   </div>
   <button className="btn primary" onClick={load} disabled={busy}>{t('supplierPerformanceApply')}</button>
  </div>

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('supplierPerformanceSupplier')}</span><strong>{s.suppliers||0}</strong></div>
   <div className="stat-card"><span>{t('supplierPerformancePOs')}</span><strong>{s.purchase_orders||0}</strong></div>
   <div className="stat-card"><span>{t('supplierPerformanceOrderedValue')}</span><strong>{s.ordered_value||0}</strong></div>
   <div className="stat-card"><span>{t('supplierPerformanceReceivedValue')}</span><strong>{s.received_value||0}</strong></div>
   <div className="stat-card"><span>{t('supplierPerformanceEvalCount')}</span><strong>{s.evaluations||0}</strong></div>
   <div className="stat-card"><span>{t('supplierPerformanceAvgScore')}</span><strong>{s.avg_score||0}</strong></div>
  </div>

  <form className="facility-panel" onSubmit={save}>
   <h2>{t('supplierPerformanceEvaluate')}</h2>
   <div className="form-grid">
    <label>{t('supplierPerformanceSupplier')}<select required value={form.supplier_id} onChange={e=>setForm(v=>({...v,supplier_id:e.target.value}))}>
     <option value="">—</option>{data.rows?.map(x=><option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}
    </select></label>
    <label>{t('supplierPerformanceDate')}<input required type="date" value={form.evaluation_date} onChange={e=>setForm(v=>({...v,evaluation_date:e.target.value}))}/></label>
    {[
     ['quality_score','supplierPerformanceQuality'],['delivery_score','supplierPerformanceDelivery'],
     ['service_score','supplierPerformanceService'],['commercial_score','supplierPerformanceCommercial']
    ].map(([key,label])=><label key={key}>{t(label)}<select value={form[key]} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}>{scoreOptions.map(n=><option key={n} value={n}>{n}</option>)}</select></label>)}
    <label>{t('supplierPerformanceNotes')}<textarea maxLength={4000} value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></label>
   </div>
   <button className="btn primary" disabled={busy||!form.supplier_id}>{t('supplierPerformanceSave')}</button>
  </form>

  <div className="facility-panel">
   <h2>{t('supplierPerformance')}</h2>
   {!data.rows?.length?<p>{t('supplierPerformanceNoData')}</p>:<div className="table-wrap"><table>
    <thead><tr><th>{t('supplierPerformanceSupplier')}</th><th>{t('supplierPerformancePOs')}</th><th>{t('supplierPerformanceFulfilled')}</th><th>{t('supplierPerformanceOrderedValue')}</th><th>{t('supplierPerformanceReceivedValue')}</th><th>{t('supplierPerformanceReceiptDays')}</th><th>{t('supplierPerformanceAvgScore')}</th></tr></thead>
    <tbody>{data.rows.map(x=><tr key={x.id}><td>{x.code} — {x.name}</td><td>{x.po_count}</td><td>{x.fulfilled_po_count}</td><td>{x.ordered_value}</td><td>{x.received_value}</td><td>{x.avg_receipt_days}</td><td><strong>{x.avg_score??'—'}</strong></td></tr>)}</tbody>
   </table></div>}
  </div>

  <div className="facility-panel">
   <h2>{t('supplierPerformanceRecent')}</h2>
   {!data.recent_evaluations?.length?<p>{t('supplierPerformanceNoData')}</p>:
    <div className="event-list">{data.recent_evaluations.map(x=><div className="event-item" key={x.id}>
     <strong>{x.supplier_name} — {x.overall_score}/5</strong>
     <span>{x.evaluation_date} · {x.full_name||x.email||''}</span>
     <small>{x.notes}</small>
    </div>)}</div>}
  </div>
 </section>
}
