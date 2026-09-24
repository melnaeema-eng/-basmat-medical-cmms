import {useEffect,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {inventoryAction,loadInventory,quantity,available} from '../lib/inventory'
import {Field,Select,Notice,Status} from '../components/FacilityFields'
export default function InventoryDetails(){
 const {id}=useParams(),{can,user}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [binId,setBinId]=useState(''),[reason,setReason]=useState('')
 const load=async()=>{setError('');try{setData(await loadInventory())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[id])
 const row=data?.requests.find(x=>x.id===id)
 const part=data?.parts.find(x=>x.id===row?.part_id)
 const wo=data?.workOrders.find(x=>x.id===row?.work_order_id)
 const manager=row&&can('inventory.manage',row.organization_id)
 const approver=row&&can('inventory.approve',row.organization_id)
 const requester=row&&row.created_by===user?.id&&can('inventory.request',row.organization_id)
 const run=async(command,payload={})=>{
  if(busy)return
  if(['reject','cancel'].includes(command)&&reason.trim().length<5){setError(t('reason')+' (5+)');return}
  if(!confirm(t('confirmAction')))return
  setBusy(true);setError('');setSuccess('')
  try{await inventoryAction('request',id,command,payload);await load();setSuccess(t('saved'))}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const button=(command,enabled,payload={},primary=false)=>enabled?<button type="button" disabled={busy} className={'btn '+(primary?'primary':'secondary')} onClick={()=>run(command,payload)}>{t(command)}</button>:null
 const options=[{value:'',label:t('select')},...(data?.stock.filter(x=>x.part_id===row?.part_id&&available(x)>=Number(row?.quantity)&&x.organization_id===row?.organization_id)||[]).map(x=>({value:x.bin_id,label:(data.warehouses.find(w=>w.id===x.warehouse_id)?.name_en||'')+' / '+data.bins.find(b=>b.id===x.bin_id)?.code+' · '+quantity(available(x))}))]
 return <section className="facility-module"><div className="page-head"><div><Link to="/inventory">← {t('inventoryRequests')}</Link><h1>{row?.request_number||t('loading')}</h1></div><button className="btn secondary" onClick={load}>{t('refresh')}</button></div>
  <Notice error={error} success={success}/>
  {!row?data?<p>{t('noData')}</p>:<p>{t('loading')}</p>:<>
   <div className="facility-panel"><h3>{t('details')}</h3><div className="form-grid">
    {[[t('workOrder'),<Link to={'/corrective/work_order/'+row.work_order_id}>{wo?.work_order_number||row.work_order_id}</Link>],[t('part'),part?.sku+' · '+(lang==='ar'?part?.name_ar:part?.name_en)],[t('quantity'),quantity(row.quantity)+' '+(part?.unit||'')],[t('status'),<Status value={row.status}/>],[t('warehouse'),data.warehouses.find(x=>x.id===row.warehouse_id)?.name_en],[t('bin'),data.bins.find(x=>x.id===row.bin_id)?.code],[t('createdAt'),new Date(row.created_at).toLocaleString(lang)]].map(([label,value],i)=><div key={i}><span className="muted">{label}</span><p>{value||'—'}</p></div>)}
   </div></div>
   <div className="facility-panel"><h3>{t('actions')}</h3><div className="row-actions">{button('approve',approver&&row.status==='submitted',{},true)}{button('issue',manager&&row.status==='reserved',{},true)}{button('receive',(manager||requester)&&row.status==='issued',{},true)}{button('consume',(manager||requester)&&row.status==='received',{},true)}{button('return',manager&&row.status==='issued',{reason})}</div>
    {manager&&row.status==='approved'&&<div className="form-grid"><Field label={t('stockLocation')}><Select value={binId} onChange={setBinId} options={options}/></Field><div className="row-actions">{button('reserve',!!binId,{bin_id:binId},true)}</div></div>}
    {(manager||approver||requester)&&['submitted','approved','reserved'].includes(row.status)&&<><Field label={t('reason')}><textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field><div className="row-actions">{button('reject',approver&&row.status==='submitted',{reason})}{button('cancel',(manager||requester),{reason})}</div></>}
    <p className="muted">{t('requestNotice')}</p>
   </div>
   <div className="facility-panel"><h3>{t('movementHistory')}</h3>{data.movements.filter(x=>x.request_id===id).map(m=><div key={m.id} className="row-actions" style={{padding:'8px 0'}}><span>{new Date(m.created_at).toLocaleString(lang)}</span><strong>{t(m.action)}</strong><span>{quantity(m.quantity)}</span><span>{m.reference}</span></div>)}</div>
  </>}
 </section>
}
