import {useEffect,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadAdvanced,loadCosts,stockAction,qty,available,unissued,awaitingReceipt,returnable} from '../lib/advancedStock'
import {Field,Select,Notice,Status} from '../components/FacilityFields'
export default function AdvancedStockDetails(){
 const {id}=useParams(),{can,user}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[costs,setCosts]=useState([]),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [form,setForm]=useState({part_id:'',owner_client_id:'',quantity:''}),[reason,setReason]=useState('')
 const [operations,setOperations]=useState({}),[pending,setPending]=useState(null)
 const load=async()=>{
  setError('')
  try{
   const bundle=await loadAdvanced()
   setData(bundle)
   const request=bundle.requests.find(x=>x.id===id)
   if(request&&can('inventory.cost.view',request.organization_id))setCosts(await loadCosts(request.organization_id,request.work_order_id))
   else setCosts([])
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[id])
 const row=data?.requests.find(x=>x.id===id)
 const lines=data?.lines.filter(x=>x.request_id===id)||[]
 const allocations=data?.allocations.filter(a=>lines.some(l=>l.id===a.line_id))||[]
 const events=data?.events.filter(e=>e.request_id===id).sort((a,b)=>a.id-b.id)||[]
 const manager=row&&can('inventory.manage',row.organization_id),approver=row&&can('inventory.approve',row.organization_id)
 const executor=row&&can('inventory.request',row.organization_id)&&(row.created_by===user?.id||data?.assignments.some(a=>a.work_order_id===row.work_order_id&&a.user_id===user?.id))
 const name=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const opts=(rows,label)=>[{value:'',label:t('select')},...(rows||[]).map(x=>({value:x.id,label:label(x)}))]
 const part=id=>data?.parts.find(x=>x.id===id)
 const lot=id=>data?.lots.find(x=>x.id===id)
 const wo=data?.workOrders.find(x=>x.id===row?.work_order_id)
 const setOp=(key,field,value)=>setOperations(o=>({...o,[key]:{...o[key],[field]:value}}))
 const op=(key,field)=>operations[key]?.[field]??''
 const run=async(command,payload={},key=null)=>{
  if(busy)return
  if(['approve','reject','issue','return','cancel','close'].includes(command)&&!confirm(t('confirmAction')))return
  setBusy(true);setError('');setSuccess('')
  const actionKey=key||crypto.randomUUID()
  const record={command,payload,key:actionKey}
  setPending(record)
  try{
   await stockAction(command,id,payload,actionKey)
   setPending(null);await load();setSuccess(t('saved'))
   if(command==='add_line')setForm({part_id:'',owner_client_id:'',quantity:''})
   if(['cancel','close','reject'].includes(command))setReason('')
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 const retry=()=>pending&&run(pending.command,pending.payload,pending.key)
 const button=(command,enabled,payload={},primary=false)=>enabled?<button type="button" disabled={busy} className={'btn '+(primary?'primary':'secondary')} onClick={()=>run(command,payload)}>{t(command)}</button>:null
 const submitLine=e=>{e.preventDefault();run('add_line',form)}
 const doQuantity=(command,key,payload,limit)=>{
  const n=Number(op(key,'quantity'))
  if(!Number.isFinite(n)||n<=0||n>limit){setError(t('quantity')+': 0 < q ≤ '+qty(limit));return}
  run(command,{...payload,quantity:n,reference:op(key,'reference')||undefined})
 }
 const details=items=><div className="form-grid">{items.map(([key,value])=><div key={key}><span className="muted">{t(key)}</span><p>{value??'—'}</p></div>)}</div>
 const remaining=l=>Number(l.issued_qty)-Number(l.consumed_qty)-Number(l.returned_received_qty)-Number(l.returned_unreceived_qty)
 return <section className="facility-module">
  <div className="page-head"><div><Link to="/advanced-stock">← {t('advancedStock')}</Link><h1>{row?.number||t('loading')}</h1></div><button className="btn secondary" onClick={load}>{t('refresh')}</button></div>
  <Notice error={error} success={success}/>
  {pending&&!busy&&<div className="facility-panel"><p>{error}</p><button className="btn secondary" onClick={retry}>{t('retryOperation')}</button></div>}
  {!row?data?<p>{t('noData')}</p>:<p>{t('loading')}</p>:<>
   <div className="facility-panel"><h3>{t('details')}</h3>{details([['workOrder',<Link to={'/corrective/work_order/'+row.work_order_id}>{wo?.work_order_number||row.work_order_id}</Link>],['status',<Status value={row.status}/>],['reason',row.reason],['createdAt',new Date(row.created_at).toLocaleString(lang)]])}<p className="muted">{t('requestNotice')}</p></div>
   <div className="facility-panel"><h3>{t('advancedRequests')}</h3>
    {lines.map(l=><div className="facility-panel" key={l.id} style={{marginBlock:'12px'}}>
     <strong>{part(l.part_id)?.sku} · {name(part(l.part_id))}</strong>
     {details([['stockOwner',l.owner_client_id?data.clients.find(c=>c.id===l.owner_client_id)?.name:t('companyStock')],['quantity',qty(l.quantity)],['reserved',qty(l.reserved_qty)],['issued',qty(l.issued_qty)],['received',qty(l.received_qty)],['consumed',qty(l.consumed_qty)],['returned',qty(Number(l.returned_received_qty)+Number(l.returned_unreceived_qty))]])}
     {manager&&row.status==='approved'&&unissued(l)>0&&<div className="facility-panel"><h4>{t('reserve')}</h4><p className="muted">{t('serialNotice')}</p>
      <Field label={t('allocation')}><Select value={op('reserve-'+l.id,'stock_lot_id')} onChange={v=>setOp('reserve-'+l.id,'stock_lot_id',v)}
       options={opts(data.lots.filter(st=>st.part_id===l.part_id&&st.organization_id===row.organization_id&&st.owner_client_id===l.owner_client_id&&available(st)>0&&(!st.expires_on||st.expires_on>=new Date().toISOString().slice(0,10))),st=>`${name(data.warehouses.find(w=>w.id===st.warehouse_id))} / ${data.bins.find(b=>b.id===st.bin_id)?.code} · ${st.lot_code||'—'} · ${st.serial_number||'—'} · ${qty(available(st))}`)}/></Field>
      <div className="form-grid"><Field label={t('quantity')}><input type="number" min="0.001" step="0.001" value={op('reserve-'+l.id,'quantity')} onChange={e=>setOp('reserve-'+l.id,'quantity',e.target.value)}/></Field><div className="row-actions"><button type="button" className="btn primary" disabled={busy||!op('reserve-'+l.id,'stock_lot_id')} onClick={()=>doQuantity('reserve','reserve-'+l.id,{line_id:l.id,stock_lot_id:op('reserve-'+l.id,'stock_lot_id')},Math.min(unissued(l),available(lot(op('reserve-'+l.id,'stock_lot_id'))||{quantity:0,reserved:0})))}>{t('reserve')}</button></div></div>
     </div>}
     {allocations.filter(a=>a.line_id===l.id).map(a=>{
      const st=lot(a.stock_lot_id)
      return <div className="facility-panel" key={a.id} style={{marginBlock:'12px'}}>
       <strong>{t('allocation')}: {st?.lot_code||'—'} / {st?.serial_number||'—'}</strong>
       <p>{name(data.warehouses.find(w=>w.id===st?.warehouse_id))} / {data.bins.find(b=>b.id===st?.bin_id)?.code}</p>
       {details([['reserved',qty(a.reserved_qty)],['issued',qty(a.issued_qty)],['received',qty(a.received_qty)],['consumed',qty(a.consumed_qty)],['returned',qty(Number(a.returned_received_qty)+Number(a.returned_unreceived_qty))]])}
       {row.status==='approved'&&<div className="form-grid">
        <Field label={t('actions')}><Select value={op(a.id,'action')} onChange={v=>setOp(a.id,'action',v)}
         options={[{value:'',label:t('select')},...(manager?['release','issue','return']:[]),...((manager||executor)?['receive','consume']:[])].map(v=>({value:v,label:t(v)}))}/></Field>
        <Field label={t('quantity')}><input type="number" min="0.001" step="0.001" value={op(a.id,'quantity')} onChange={e=>setOp(a.id,'quantity',e.target.value)}/></Field>
        {op(a.id,'action')==='return'&&<Field label={t('custody')}><Select value={op(a.id,'custody')} onChange={v=>setOp(a.id,'custody',v)} options={[{value:'',label:t('select')},{value:'received',label:t('receivedCustody')},{value:'unreceived',label:t('unreceivedCustody')}]}/></Field>}
        <Field label={t('reference')}><input value={op(a.id,'reference')} onChange={e=>setOp(a.id,'reference',e.target.value)}/></Field>
        <div className="row-actions"><button type="button" disabled={busy||!op(a.id,'action')||(op(a.id,'action')==='return'&&!op(a.id,'custody'))} className="btn primary" onClick={()=>{
         const action=op(a.id,'action')
         const limit=action==='release'||action==='issue'?Number(a.reserved_qty):action==='receive'?awaitingReceipt(a):action==='consume'?returnable(a):op(a.id,'custody')==='received'?returnable(a):awaitingReceipt(a)
         doQuantity(action,a.id,{line_id:l.id,allocation_id:a.id,...(action==='return'?{custody:op(a.id,'custody')}:{})},limit)
        }}>{t('save')}</button></div>
       </div>}
      </div>
     })}
    </div>)}
    {row.status==='submitted'&&(manager||executor)&&<form className="facility-form" onSubmit={submitLine}><h3>{t('addLine')}</h3><div className="form-grid">
     <Field label={t('part')} required><Select required value={form.part_id} onChange={v=>setForm(f=>({...f,part_id:v}))} options={opts(data.parts.filter(p=>p.organization_id===row.organization_id&&p.status==='active'),p=>p.sku+' · '+name(p))}/></Field>
     <Field label={t('stockOwner')}><Select value={form.owner_client_id} onChange={v=>setForm(f=>({...f,owner_client_id:v}))} options={[{value:'',label:t('companyStock')},...(wo?.client_id?data.clients.filter(c=>c.id===wo.client_id).map(c=>({value:c.id,label:c.name})):[])]}/></Field>
     <Field label={t('quantity')} required><input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))}/></Field>
    </div><button className="btn primary" type="submit" disabled={busy}>{t('addLine')}</button></form>}
   </div>
   <div className="facility-panel"><h3>{t('actions')}</h3><div className="row-actions">{button('approve',approver&&row.status==='submitted'&&lines.length>0,{},true)}{button('close',manager&&row.status==='approved'&&lines.every(l=>Number(l.reserved_qty)===0&&remaining(l)===0),{reason})}</div>
    {(manager||executor)&&['submitted','approved'].includes(row.status)&&<><Field label={t('reason')}><textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field><div className="row-actions">{button('reject',approver&&row.status==='submitted'&&reason.trim().length>=5,{reason})}{button('cancel',reason.trim().length>=5,{reason})}</div></>}
    <p className="muted">{t('closureNotice')} {t('independentApproval')}</p>
   </div>
   {can('inventory.cost.view',row.organization_id)&&<div className="facility-panel"><h3>{t('advancedCosts')}</h3>{costs.length?costs.map(c=><div key={c.currency} className="row-actions"><strong>{c.currency}</strong><strong>{Number(c.actual_cost).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>):<p>{t('noData')}</p>}<p className="muted">{t('costNotice')}</p></div>}
   <div className="facility-panel"><h3>{t('history')}</h3>{events.map(e=><div key={e.id} style={{padding:'8px 0',borderBottom:'1px solid #ddd'}}><strong>{t(e.action)}</strong><span> · {qty(e.quantity)}</span><p className="muted">{new Date(e.created_at).toLocaleString(lang)} · {e.actor_id}</p>{e.details?.reason&&<p>{e.details.reason}</p>}</div>)}</div>
  </>}
 </section>
}
