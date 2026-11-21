import {useEffect,useState} from 'react'
import {Link,useOutletContext} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadCosting,saveRate,addCost,voidCost} from '../lib/costing'

const dateToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const categories={contractor:['مقاول','Contractor'],transport:['نقل','Transport'],rental:['إيجار معدات','Equipment rental'],other:['أخرى','Other']}
const rateForm=()=>({technician_id:'',hourly_rate:'',effective_from:dateToday(),effective_to:''})
const costForm=()=>({work_order_id:'',cost_type:'contractor',description:'',amount:'',cost_date:dateToday()})

export default function MaintenanceCosting(){
 const context=useOutletContext()
 const org=typeof context==='string'?context:context?.companyId
 const {lang,t}=useLanguage(),L=(ar,en)=>lang==='ar'?ar:en
 if(!org)return <section className="facility-module"><h1>{t('costingCenter')}</h1>
  <p>{L('افتح مساحة الشركة لعرض تكاليف الصيانة.','Open the company workspace to view maintenance costs.')}</p>
  <Link className="btn secondary" to="/maintenance-companies">{L('مساحات الشركات','Company workspaces')}</Link>
 </section>
 return <CompanyCosting key={org} org={org}/>
}

function CompanyCosting({org}){
 const {lang,t}=useLanguage(),L=(ar,en)=>lang==='ar'?ar:en
 const [data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
 const [rate,setRate]=useState(rateForm),[cost,setCost]=useState(costForm)
 const currency='SAR'
 const format=value=>value==null?'—':new Intl.NumberFormat(lang,{style:'currency',currency}).format(Number(value))
 const field=(label,child)=><label>{label}{child}</label>
 const change=(set,key)=>e=>set(v=>({...v,[key]:e.target.value}))
 const message=e=>e.code==='42501'?L('الحساب يحتاج إلى صلاحية مالية لهذه الشركة.','This account needs finance permission for the company.'):e.message
 async function load(){
  setBusy(true);setError('')
  try{setData(await loadCosting(org,currency))}
  catch(e){setData(null);setError(message(e))}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[org])
 async function action(run,success){
  if(busy||!data?.can_manage)return
  setBusy(true);setError('');setNotice('')
  try{await run();setNotice(success);await load()}
  catch(e){setError(message(e))}
  finally{setBusy(false)}
 }
 return <section className="facility-module">
  <div className="page-head"><h1>{t('costingCenter')}</h1><div className="row-actions">
   <Link className="btn secondary" to="/statements">{L('مستخلصات الصيانة','Maintenance statements')}</Link>
   <button className="btn secondary" disabled={busy} onClick={load}>{t('costingRefresh')}</button>
  </div></div>
  <p>{L('تُحتسب التكلفة الداخلية من ساعات العمل والمواد المصروفة والمصاريف المسجلة. تُسعّر المطالبة من بنود العقد داخل المستخلص.','Internal cost uses labor logs, consumed materials and recorded expenses. Statement claims use contract prices.')}</p>
  {error&&<div className="alert error" role="alert">{error}</div>}
  {notice&&<div className="alert success" role="status">{notice}</div>}
  {!data&&!error&&<p role="status">{L('جارٍ تحميل تكاليف الصيانة…','Loading maintenance costs…')}</p>}
  {data&&<>
   <div className="stats-grid facility-stats">{[['costingLabor','labor'],['costingMaterial','material'],['costingExtra','extra'],['costingTotal','grand']].map(([label,key])=><div className="stat-card" key={key}><span>{t(label)}</span><strong>{format(data.totals[key])}</strong></div>)}</div>
   {data.truncated&&<p>{L('الأرقام لأحدث 500 أمر عمل في الشركة.','Totals cover the 500 most recent work orders in this company.')}</p>}
   {data.can_manage&&<>
    <form className="facility-panel" onSubmit={e=>{
     e.preventDefault()
     action(()=>saveRate({...rate,organization_id:org,currency}),L('تم حفظ تكلفة الساعة للفترة المحددة.','Hourly cost saved for the selected period.'))
    }}>
     <h2>{t('costingSaveRate')}</h2>
     <fieldset disabled={busy} className="form-grid">
      {field(L('الفني أو الموظف','Technician or employee'),<select required value={rate.technician_id} onChange={change(setRate,'technician_id')}><option value="">{t('select')}</option>{data.staff.map(s=><option key={s.id} value={s.id}>{s.full_name||s.email}</option>)}</select>)}
      {field(L('تكلفة الساعة · ر.س','Hourly cost · SAR'),<input required type="number" min="0" step="0.0001" value={rate.hourly_rate} onChange={change(setRate,'hourly_rate')}/>)}
      {field(L('سارية من','Effective from'),<input required type="date" value={rate.effective_from} onChange={change(setRate,'effective_from')}/>)}
      {field(L('سارية حتى','Effective until'),<input type="date" min={rate.effective_from} value={rate.effective_to} onChange={change(setRate,'effective_to')}/>)}
      <button className="btn primary">{t('costingSaveRate')}</button>
     </fieldset>
    </form>
    <form className="facility-panel" onSubmit={e=>{
     e.preventDefault()
     action(async()=>{await addCost({...cost,currency});setCost(v=>({...v,description:'',amount:''}))},L('تم تسجيل المصروف على أمر العمل.','Expense recorded on the work order.'))
    }}>
     <h2>{t('costingAdd')}</h2>
     <fieldset disabled={busy||!data.rows.length} className="form-grid">
      {field(t('costingWorkOrder'),<select required value={cost.work_order_id} onChange={change(setCost,'work_order_id')}><option value="">{t('select')}</option>{data.rows.map(w=><option key={w.id} value={w.id}>{w.work_order_number} · {w.title}</option>)}</select>)}
      {field(L('نوع المصروف','Expense type'),<select value={cost.cost_type} onChange={change(setCost,'cost_type')}>{Object.entries(categories).map(([k,l])=><option value={k} key={k}>{L(...l)}</option>)}</select>)}
      {field(t('costingDescription'),<input required minLength={3} maxLength={500} value={cost.description} onChange={change(setCost,'description')}/>)}
      {field(t('costingAmount'),<input required type="number" min="0" step="0.01" value={cost.amount} onChange={change(setCost,'amount')}/>)}
      {field(L('تاريخ المصروف','Expense date'),<input required type="date" value={cost.cost_date} onChange={change(setCost,'cost_date')}/>)}
      <button className="btn primary">{t('costingAdd')}</button>
     </fieldset>
    </form>
   </>}
   <div className="facility-panel"><h2>{L('تكلفة الساعة المسجلة','Saved hourly costs')}</h2>
    {data.rates.length?<ul>{data.rates.map(r=><li key={r.technician_id+r.effective_from}>{r.full_name||data.staff.find(s=>s.id===r.technician_id)?.email||'—'} · {r.hourly_rate} {r.currency} · {r.effective_from} — {r.effective_to||L('مفتوحة','Open-ended')}</li>)}</ul>:<p>{t('costingNoData')}</p>}
   </div>
   <div className="facility-panel"><h2>{t('costing')}</h2>
    {data.rows.length?<div className="table-wrap"><table><thead><tr>{['costingWorkOrder','costingLabor','costingMaterial','costingExtra','costingTotal'].map(key=><th key={key}>{t(key)}</th>)}</tr></thead>
    <tbody>{data.rows.map(w=><tr key={w.id}><td>{w.work_order_number}<br/><small>{w.title}</small></td><td>{format(w.labor_cost)}
    {Number(w.unpriced_labor_minutes)>0&&<small> · {w.unpriced_labor_minutes} {L('دقيقة دون تكلفة ساعة','min without an hourly cost')}</small>}</td>
    <td>{format(w.material_cost)}</td><td>{format(w.additional_cost)}</td><td><strong>{format(w.total_cost)}</strong></td></tr>)}</tbody></table></div>:<p>{t('costingNoData')}</p>}
   </div>
   <div className="facility-panel"><h2>{t('costingExtra')}</h2>{data.extra_costs.map(c=><div className="event-item" key={c.id}>
    <strong>{c.work_order_number} · {c.description} · {format(c.amount)}</strong>
    {data.can_manage&&<button type="button" className="btn xs danger-soft" disabled={busy} onClick={()=>{
     const reason=window.prompt(L('سبب إلغاء المصروف، خمسة أحرف على الأقل','Reason for voiding, at least five characters'))
     if(reason?.trim().length>=5)action(()=>voidCost(c.id,reason),L('تم إلغاء المصروف.','Expense voided.'))
    }}>{t('costingVoid')}</button>}
   </div>)}</div>
  </>}
 </section>
}
