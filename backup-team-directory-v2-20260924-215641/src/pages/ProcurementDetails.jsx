import {useEffect,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadProcurement,procurementAction,amount,total,receiptRemaining} from '../lib/procurement'
import {Field,Select,Notice,Status} from '../components/FacilityFields'
const emptyReceipt={line_id:'',quantity:'',bin_id:'',owner_client_id:'',lot_code:'',serial_number:'',expires_on:'',supplier_reference:'',idempotency_key:''}
export default function ProcurementDetails(){
 const {kind,id}=useParams(),navigate=useNavigate(),{can,user}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [line,setLine]=useState({part_id:'',quantity:'',notes:''}),[reason,setReason]=useState(''),[supplier,setSupplier]=useState(''),[currency,setCurrency]=useState('SAR'),[numberMode,setNumberMode]=useState('automatic'),[number,setNumber]=useState(''),[prices,setPrices]=useState({})
 const load=async()=>{setError('');try{setData(await loadProcurement())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[kind,id])
 const row=(kind==='requisition'?data?.requisitions:data?.orders)?.find(x=>x.id===id)
 const manager=row&&can('procurement.manage',row.organization_id),approver=row&&can('procurement.approve',row.organization_id)
 const requester=row&&can('procurement.request',row.organization_id)&&row.created_by===user?.id
 const name=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const opts=(rows,label)=>[{value:'',label:t('select')},...(rows||[]).map(x=>({value:x.id,label:label(x)}))]
 const lines=kind==='requisition'?data?.requisitionLines.filter(l=>l.requisition_id===id)||[]:data?.orderLines.filter(l=>l.po_id===id)||[]
 const part=id=>data?.parts.find(x=>x.id===id)
 const setReceipt=(key,value)=>setReceiptState(f=>({...f,[key]:value}))
 // A receipt key is retained across a retry and regenerated only after success.
 const [receiptState,setReceiptState]=useState(emptyReceipt)
 const receiptForm=receiptState
 const run=async(command,payload={},target=kind)=>{
  if(busy)return
  if(['approve','reject','submit','cancel'].includes(command)&&!confirm(t('confirmAction')))return
  setBusy(true);setError('');setSuccess('')
  try{
   const result=await procurementAction(target,id,command,payload)
   if(target==='purchase_order'&&command==='create'){navigate('/procurement/purchase_order/'+result);return}
   await load();setSuccess(t('saved'))
   if(command==='receive')setReceiptState(emptyReceipt)
   if(command==='add_line')setLine({part_id:'',quantity:'',notes:''})
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const button=(command,enabled,payload={},target=kind,primary=false)=>enabled?<button type="button" disabled={busy} className={'btn '+(primary?'primary':'secondary')} onClick={()=>run(command,payload,target)}>{t(command)}</button>:null
 const submitLine=e=>{e.preventDefault();run('add_line',line)}
 const createPO=e=>{e.preventDefault();run('create',{requisition_id:id,supplier_id:supplier,currency,number_mode:numberMode,number,prices},'purchase_order')}
 const receive=e=>{
  e.preventDefault()
  const key=receiptForm.idempotency_key||crypto.randomUUID()
  if(!receiptForm.idempotency_key)setReceiptState(f=>({...f,idempotency_key:key}))
  run('receive',{...receiptForm,idempotency_key:key})
 }
 const details=items=><div className="form-grid">{items.map(([key,value])=><div key={key}><span className="muted">{t(key)}</span><p>{value??'—'}</p></div>)}</div>
 return <section className="facility-module">
  <div className="page-head"><div><Link to="/procurement">← {t('procurement')}</Link><h1>{row?.number||t('loading')}</h1></div><button className="btn secondary" onClick={load}>{t('refresh')}</button></div>
  <Notice error={error} success={success}/>
  {!row?data?<p>{t('noData')}</p>:<p>{t('loading')}</p>:<>
   <div className="facility-panel"><h3>{t(kind)}</h3>{details([['status',t(row.status)],['organization',data.organizations.find(x=>x.id===row.organization_id)?.name],['workOrder',kind==='requisition'?data.workOrders.find(x=>x.id===row.work_order_id)?.work_order_number:null],['supplier',kind==='purchase_order'?data.suppliers.find(x=>x.id===row.supplier_id)?.name:null],['currency',row.currency],['reason',row.reason],['createdAt',new Date(row.created_at).toLocaleString(lang)]])}</div>
   <div className="facility-panel"><h3>{t('details')}</h3><div className="table-wrap"><table className="data-table"><thead><tr>{[t('part'),t('quantity'),...(kind==='purchase_order'?[t('unitPrice'),t('lineTotal'),t('remaining')]:[])].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{lines.map(l=><tr key={l.id}><td>{part(l.part_id)?.sku} · {name(part(l.part_id))}</td><td>{amount(l.quantity,3)}</td>{kind==='purchase_order'&&<><td>{amount(l.unit_price,4)}</td><td>{amount(Number(l.quantity)*Number(l.unit_price))}</td><td>{amount(receiptRemaining(l),3)}</td></>}</tr>)}</tbody></table></div>
    {kind==='purchase_order'&&<p><strong>{t('total')}: {amount(total(lines))} {row.currency}</strong></p>}
    {kind==='requisition'&&row.status==='draft'&&(manager||requester)&&<form onSubmit={submitLine} className="facility-form"><div className="form-grid"><Field label={t('part')} required><Select required value={line.part_id} onChange={v=>setLine(f=>({...f,part_id:v}))} options={opts(data.parts.filter(x=>x.organization_id===row.organization_id&&x.status==='active'),x=>x.sku+' · '+name(x))}/></Field><Field label={t('quantity')} required><input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={e=>setLine(f=>({...f,quantity:e.target.value}))}/></Field><Field label={t('notes')}><input value={line.notes} onChange={e=>setLine(f=>({...f,notes:e.target.value}))}/></Field></div><button className="btn secondary" disabled={busy} type="submit">{t('addLine')}</button></form>}
   </div>
   {kind==='requisition'?<>
    <div className="facility-panel"><div className="row-actions">{button('submit',(manager||requester)&&row.status==='draft'&&lines.length>0,{},kind,true)}{button('approve',approver&&row.status==='submitted',{},kind,true)}</div>
     {approver&&row.status==='submitted'&&<><Field label={t('reason')}><textarea value={reason} onChange={e=>setReason(e.target.value)}/></Field>{button('reject',reason.trim().length>=5,{reason})}</>}
     <p className="muted">{t('approvalNotice')}</p>
    </div>
    {manager&&row.status==='approved'&&<form className="facility-form facility-panel" onSubmit={createPO}><h3>{t('newPurchaseOrder')}</h3><div className="form-grid">
     <Field label={t('supplier')} required><Select required value={supplier} onChange={setSupplier} options={opts(data.suppliers.filter(x=>x.organization_id===row.organization_id&&x.status==='active'),x=>x.name)}/></Field>
     <Field label={t('currency')}><input required maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></Field>
     <Field label={t('numberMode')}><Select value={numberMode} onChange={setNumberMode} options={['automatic','manual'].map(v=>({value:v,label:t(v)}))}/></Field>
     {numberMode==='manual'&&<Field label={t('officialNumber')} required><input required value={number} onChange={e=>setNumber(e.target.value)}/></Field>}
     {lines.map(l=><Field key={l.id} label={part(l.part_id)?.sku+' · '+t('unitPrice')} required><input type="number" min="0" step="0.0001" required value={prices[l.part_id]??''} onChange={e=>setPrices(p=>({...p,[l.part_id]:e.target.value}))}/></Field>)}
    </div><button className="btn primary" type="submit" disabled={busy}>{t('newPurchaseOrder')}</button></form>}
    {data.orders.filter(x=>x.requisition_id===id).map(x=><p key={x.id}><Link to={'/procurement/purchase_order/'+x.id}>{x.number}</Link></p>)}
   </>:<>
    <div className="facility-panel"><div className="row-actions">{button('approve',approver&&row.status==='draft',{},kind,true)}{button('cancel',manager&&row.status==='draft',{reason})}</div><p className="muted">{t('approvalNotice')}</p></div>
    {manager&&can('inventory.manage',row.organization_id)&&['approved','part_received'].includes(row.status)&&<form className="facility-form facility-panel" onSubmit={receive}><h3>{t('receive')}</h3><p className="muted">{t('receiptNotice')}</p><div className="form-grid">
     <Field label={t('part')} required><Select required value={receiptForm.line_id} onChange={v=>setReceipt('line_id',v)} options={opts(lines.filter(l=>receiptRemaining(l)>0),l=>part(l.part_id)?.sku+' · '+amount(receiptRemaining(l),3)+' '+t('remaining'))}/></Field>
     <Field label={t('quantity')} required><input type="number" min="0.001" step="0.001" max={lines.find(l=>l.id===receiptForm.line_id)?receiptRemaining(lines.find(l=>l.id===receiptForm.line_id)):undefined} required value={receiptForm.quantity} onChange={e=>setReceipt('quantity',e.target.value)}/></Field>
     <Field label={t('bin')} required><Select required value={receiptForm.bin_id} onChange={v=>setReceipt('bin_id',v)} options={opts(data.bins.filter(b=>b.organization_id===row.organization_id),b=>name(data.warehouses.find(w=>w.id===b.warehouse_id))+' / '+b.code)}/></Field>
     <Field label={t('stockOwner')}><Select value={receiptForm.owner_client_id} onChange={v=>setReceipt('owner_client_id',v)} options={[{value:'',label:t('companyStock')},...data.clients.filter(c=>c.organization_id===row.organization_id).map(c=>({value:c.id,label:c.name}))]}/></Field>
     {['lot_code','serial_number','expires_on','supplier_reference'].map(key=><Field key={key} label={t(({lot_code:'lotCode',serial_number:'serialNumber',expires_on:'expiresOn',supplier_reference:'supplierReference'})[key])} required={key==='supplier_reference'}><input type={key==='expires_on'?'date':'text'} required={key==='supplier_reference'} value={receiptForm[key]} onChange={e=>setReceipt(key,e.target.value)}/></Field>)}
    </div><button type="submit" className="btn primary" disabled={busy}>{t('receive')}</button></form>}
    <div className="facility-panel"><h3>{t('goodsReceipts')}</h3>{data.receipts.filter(x=>x.po_id===id).map(x=><div className="row-actions" key={x.id} style={{padding:'8px 0'}}><strong>{x.number}</strong><span>{x.supplier_reference}</span><span>{amount(x.quantity,3)}</span><span>{new Date(x.received_at).toLocaleDateString(lang)}</span></div>)}</div>
   </>}
  </>}
 </section>
}
