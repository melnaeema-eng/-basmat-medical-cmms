import {useEffect,useMemo,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadProcurement,procurementAction,amount} from '../lib/procurement'
import {Field,Select,Dialog,Notice,FormActions,Status} from '../components/FacilityFields'
import DataTable from '../components/DataTable'
export default function Procurement(){
 const {can}=useAuth(),{t,lang}=useLanguage(),navigate=useNavigate()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [tab,setTab]=useState('requisitions'),[org,setOrg]=useState(''),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[form,setForm]=useState({})
 const load=async()=>{setError('');try{setData(await loadProcurement())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 const name=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const opts=(rows,label)=>[{value:'',label:t('select')},...(rows||[]).map(x=>({value:x.id,label:label(x)}))]
 const set=(key,value)=>setForm(f=>({...f,[key]:value}))
 const part=id=>data?.parts.find(x=>x.id===id)
 const source=tab==='suppliers'?data?.suppliers:tab==='requisitions'?data?.requisitions:tab==='orders'?data?.orders:tab==='receipts'?data?.receipts:data?.stock
 const rows=useMemo(()=>(source||[]).filter(x=>(!org||x.organization_id===org)&&(!query||Object.values(x).some(v=>typeof v==='string'&&v.toLowerCase().includes(query.toLowerCase())))),[source,org,query])
 const start=()=>{setForm(tab==='suppliers'?{organization_id:org,name:'',tax_number:'',contact_name:'',email:'',phone:'',address:''}:{organization_id:org,work_order_id:'',reason:''});setOpen(true)}
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{const kind=tab==='suppliers'?'supplier':'requisition';const id=await procurementAction(kind,null,'create',form);setOpen(false);await load();setSuccess(t('saved'));if(kind==='requisition')navigate('/procurement/requisition/'+id)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const columns={
  suppliers:[{key:'code',label:t('supplierCode')},{key:'name',label:t('name')},{key:'contact_name',label:t('contactName')},{key:'phone',label:t('phone')},{key:'status',label:t('status'),render:x=><Status value={x.status}/>}],
  requisitions:[{key:'number',label:t('requisitionNumber'),render:x=><Link to={'/procurement/requisition/'+x.id}>{x.number}</Link>},{key:'reason',label:t('reason')},{key:'status',label:t('status'),render:x=><Status value={x.status}/>},{key:'actions',label:t('actions'),render:x=><Link className="btn xs secondary" to={'/procurement/requisition/'+x.id}>{t('details')}</Link>}],
  orders:[{key:'number',label:t('purchaseOrderNumber'),render:x=><Link to={'/procurement/purchase_order/'+x.id}>{x.number}</Link>},{key:'supplier',label:t('supplier'),render:x=>data.suppliers.find(s=>s.id===x.supplier_id)?.name},{key:'currency',label:t('currency')},{key:'status',label:t('status'),render:x=><Status value={x.status}/>},{key:'actions',label:t('actions'),render:x=><Link className="btn xs secondary" to={'/procurement/purchase_order/'+x.id}>{t('details')}</Link>}],
  receipts:[{key:'number',label:t('goodsReceipt')},{key:'reference',label:t('supplierReference'),render:x=>x.supplier_reference},{key:'part',label:t('part'),render:x=>part(data.orderLines.find(l=>l.id===x.po_line_id)?.part_id)?.sku},{key:'quantity',label:t('quantity'),render:x=>amount(x.quantity,3)},{key:'created_at',label:t('createdAt'),render:x=>new Date(x.received_at).toLocaleString(lang)}],
  stock:[{key:'part',label:t('part'),render:x=>part(x.part_id)?.sku},{key:'owner',label:t('stockOwner'),render:x=>x.owner_client_id?data.clients.find(c=>c.id===x.owner_client_id)?.name:t('companyStock')},{key:'lot',label:t('lotCode'),render:x=>x.lot_code||'—'},{key:'serial',label:t('serialNumber'),render:x=>x.serial_number||'—'},{key:'bin',label:t('bin'),render:x=>data.bins.find(b=>b.id===x.bin_id)?.code},{key:'quantity',label:t('onHand'),render:x=>amount(x.quantity,3)},{key:'cost',label:t('unitCost'),render:x=>amount(x.unit_cost,4)+' '+x.currency}]
 }
 return <section className="facility-module">
  <div className="page-head"><h1>{t('procurement')}</h1><div className="row-actions"><button className="btn secondary" onClick={load}>{t('refresh')}</button>{(tab==='suppliers'?can('procurement.manage',org||null):tab==='requisitions'?can('procurement.request',org||null):false)&&<button className="btn primary" onClick={start}>{t(tab==='suppliers'?'newSupplier':'newRequisition')}</button>}</div></div>
  <Notice error={error} success={success}/>
  <div className="row-actions">{[['requisitions','requisitions'],['orders','purchaseOrders'],['suppliers','suppliers'],['receipts','goodsReceipts'],['stock','traceableStock']].map(([key,label])=><button key={key} className={'btn '+(tab===key?'primary':'secondary')} onClick={()=>{setTab(key);setQuery('')}}>{t(label)} ({data?.[key]?.length||0})</button>)}</div>
  <div className="facility-panel filter-grid"><Field label={t('organization')}><Select value={org} onChange={setOrg} options={opts(data?.organizations,name)}/></Field><Field label={t('search')}><input value={query} onChange={e=>setQuery(e.target.value)}/></Field></div>
  {!data?<p>{t('loading')}</p>:<DataTable rows={rows} columns={columns[tab]} emptyText={t('noData')}/>}
  <div className="facility-panel"><p className="muted">{t(tab==='stock'?'stockNotice':'procurementNotice')}</p></div>
  <Dialog open={open} title={t(tab==='suppliers'?'newSupplier':'newRequisition')} onClose={()=>!busy&&setOpen(false)}>
   <form className="facility-form" onSubmit={submit}><div className="form-grid">
    <Field label={t('organization')} required><Select required value={form.organization_id||''} onChange={v=>set('organization_id',v)} options={opts(data?.organizations.filter(x=>can(tab==='suppliers'?'procurement.manage':'procurement.request',x.id)),name)}/></Field>
    {tab==='suppliers'?<>
     {['name','tax_number','contact_name','email','phone','address'].map(key=><Field key={key} label={t(({tax_number:'taxNumber',contact_name:'contactName'})[key]||key)} required={key==='name'}><input required={key==='name'} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></Field>)}
    </>:<>
     <Field label={t('workOrder')}><Select value={form.work_order_id||''} onChange={v=>set('work_order_id',v)} options={opts(data?.workOrders.filter(x=>x.organization_id===form.organization_id),x=>x.work_order_number+' · '+x.title)}/></Field>
     <Field label={t('reason')} required wide><textarea required minLength={5} value={form.reason||''} onChange={e=>set('reason',e.target.value)}/></Field>
    </>}
   </div><FormActions busy={busy} onCancel={()=>setOpen(false)}/></form>
  </Dialog>
 </section>
}
