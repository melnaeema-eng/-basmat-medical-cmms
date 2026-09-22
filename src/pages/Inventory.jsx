import {useEffect,useMemo,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {inventoryAction,loadInventory,quantity,available,stockTotals} from '../lib/inventory'
import {Field,Select,Dialog,Notice,Status,FormActions} from '../components/FacilityFields'
import DataTable from '../components/DataTable'
const blankPart={organization_id:'',name_ar:'',name_en:'',manufacturer:'',manufacturer_part_number:'',unit:'each',category:'',barcode:'',criticality:'medium',min_qty:0,reorder_qty:0,lead_days:0,description:''}
const blankWh={organization_id:'',site_id:'',name_ar:'',name_en:'',kind:'central'}
const blankBin={warehouse_id:'',code:'',description:''}
const blankMove={part_id:'',bin_id:'',to_bin_id:'',quantity:'',reference:'',reason:''}
const blankRequest={work_order_id:'',part_id:'',quantity:''}
export default function Inventory(){
 const {can}=useAuth(),{t,lang}=useLanguage(),navigate=useNavigate()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [tab,setTab]=useState('parts'),[form,setForm]=useState(blankPart),[open,setOpen]=useState(false),[mode,setMode]=useState('create'),[query,setQuery]=useState(''),[org,setOrg]=useState('')
 const load=async()=>{setError('');try{setData(await loadInventory())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 const name=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const opts=(rows,label)=>[{value:'',label:t('select')},...(rows||[]).map(x=>({value:x.id,label:label(x)}))]
 const set=(key,value)=>setForm(f=>({...f,[key]:value,...(key==='organization_id'?{site_id:'',part_id:'',bin_id:'',warehouse_id:''}:key==='part_id'?{bin_id:'',to_bin_id:''}:key==='bin_id'?{to_bin_id:''}:{})}))
 const source=tab==='parts'?data?.parts:tab==='warehouses'?data?.warehouses:tab==='stock'?data?.stock:tab==='requests'?data?.requests:data?.movements
 const rows=useMemo(()=>{const all=source||[];return all.filter(x=>(!org||x.organization_id===org)&&(!query||Object.values(x).some(v=>typeof v==='string'&&v.toLowerCase().includes(query.toLowerCase()))))},[source,org,query])
 const part=x=>data?.parts.find(p=>p.id===x)
 const bin=x=>data?.bins.find(b=>b.id===x)
 const warehouse=x=>data?.warehouses.find(w=>w.id===x)
 const openForm=(kind,command='create',initial={})=>{
  setMode(command)
  const defaults=kind==='parts'?blankPart:kind==='warehouses'?blankWh:kind==='bin'?blankBin:kind==='stock'?blankMove:blankRequest
  setForm({...defaults,...initial,...(kind==='parts'||kind==='warehouses'?{organization_id:org||''}:{})})
  setOpen(kind);setError('')
 }
 const submit=async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('')
  try{
   const kind=open==='parts'?'part':open==='warehouses'?'warehouse':open==='bin'?'bin':open==='stock'?'stock':'request'
   const id=await inventoryAction(kind,null,mode,form)
   setOpen(false);await load();setSuccess(t('saved'))
   if(kind==='request')navigate('/inventory/request/'+id)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const canManage=can('inventory.manage',org||null)
 const canRequest=can('inventory.request',org||null)
 const columns={
  parts:[
   {key:'sku',label:t('sku')},{key:'name',label:t('part'),render:x=>name(x)},
   {key:'manufacturer_part_number',label:t('manufacturerPartNumber')},{key:'unit',label:t('unit')},
   {key:'onHand',label:t('onHand'),render:x=>quantity(stockTotals(data.stock,x.id).quantity)},
   {key:'available',label:t('available'),render:x=>quantity(stockTotals(data.stock,x.id).quantity-stockTotals(data.stock,x.id).reserved)},
   {key:'status',label:t('status'),render:x=><Status value={x.status}/>}
  ],
  warehouses:[
   {key:'code',label:t('code')},{key:'name',label:t('warehouse'),render:x=>name(x)},{key:'kind',label:t('warehouseKind'),render:x=>t(x.kind)},
   {key:'bins',label:t('bin'),render:x=><div>{data.bins.filter(b=>b.warehouse_id===x.id).map(b=><span key={b.id} className="badge">{b.code} </span>)}</div>},
   {key:'actions',label:t('actions'),render:x=>can('inventory.manage',x.organization_id)&&<button className="btn xs secondary" onClick={()=>openForm('bin','create',{warehouse_id:x.id})}>{t('newBin')}</button>}
  ],
  stock:[
   {key:'part',label:t('part'),render:x=>part(x.part_id)?.sku+' · '+name(part(x.part_id))},
   {key:'warehouse',label:t('warehouse'),render:x=>name(warehouse(x.warehouse_id))},
   {key:'bin',label:t('bin'),render:x=>bin(x.bin_id)?.code},
   {key:'quantity',label:t('onHand'),render:x=>quantity(x.quantity)},
   {key:'reserved',label:t('reserved'),render:x=>quantity(x.reserved)},
   {key:'available',label:t('available'),render:x=>quantity(available(x))}
  ],
  requests:[
   {key:'request_number',label:t('requestNumber'),render:x=><Link to={'/inventory/request/'+x.id}>{x.request_number}</Link>},
   {key:'work_order',label:t('workOrder'),render:x=>data.workOrders.find(w=>w.id===x.work_order_id)?.work_order_number},
   {key:'part',label:t('part'),render:x=>part(x.part_id)?.sku},
   {key:'quantity',label:t('quantity'),render:x=>quantity(x.quantity)},
   {key:'status',label:t('status'),render:x=><Status value={x.status}/>}
  ],
  movements:[
   {key:'created_at',label:t('createdAt'),render:x=>new Date(x.created_at).toLocaleString(lang)},
   {key:'action',label:t('movementType'),render:x=>t(x.action)},
   {key:'part',label:t('part'),render:x=>part(x.part_id)?.sku},
   {key:'quantity',label:t('quantity'),render:x=>quantity(x.quantity)},
   {key:'from',label:t('bin'),render:x=>bin(x.from_bin_id)?.code||'—'},
   {key:'to',label:t('destinationBin'),render:x=>bin(x.to_bin_id)?.code||'—'},
   {key:'reference',label:t('reference')}
  ]
 }
 const low=(data?.parts||[]).filter(p=>p.min_qty>0&&stockTotals(data.stock,p.id).quantity-stockTotals(data.stock,p.id).reserved<p.min_qty)
 const stockOptions=()=>opts(data?.stock.filter(x=>available(x)>0&&(!form.part_id||x.part_id===form.part_id)),x=>`${part(x.part_id)?.sku} · ${name(warehouse(x.warehouse_id))} / ${bin(x.bin_id)?.code} · ${quantity(available(x))}`)
 return <section className="facility-module">
  <div className="page-head"><h1>{t('inventory')}</h1><div className="row-actions"><button className="btn secondary" onClick={load}>{t('refresh')}</button>
   {canManage&&tab==='parts'&&<button className="btn primary" onClick={()=>openForm('parts')}>{t('newPart')}</button>}
   {canManage&&tab==='warehouses'&&<button className="btn primary" onClick={()=>openForm('warehouses')}>{t('newWarehouse')}</button>}
   {canManage&&tab==='stock'&&<button className="btn primary" onClick={()=>openForm('stock','receipt')}>{t('newMovement')}</button>}
   {canRequest&&tab==='requests'&&<button className="btn primary" onClick={()=>openForm('requests')}>{t('newRequest')}</button>}
  </div></div>
  <Notice error={error} success={success}/>
  {data&&<div className="stats-grid facility-stats">{[['inventoryParts',data.parts.length],['inventoryWarehouses',data.warehouses.length],['lowStock',low.length],['inventoryRequests',data.requests.filter(x=>!['consumed','cancelled','rejected'].includes(x.status)).length]].map(([k,v])=><div className="stat-card" key={k}><span>{t(k)}</span><strong>{v}</strong></div>)}</div>}
  <div className="row-actions">{[['parts','inventoryParts'],['warehouses','inventoryWarehouses'],['stock','inventoryStock'],['requests','inventoryRequests'],['movements','inventoryMovements']].map(([key,label])=><button key={key} className={'btn '+(tab===key?'primary':'secondary')} onClick={()=>{setTab(key);setQuery('')}}>{t(label)}</button>)}</div>
  <div className="facility-panel filter-grid"><Field label={t('organization')}><Select value={org} onChange={setOrg} options={opts(data?.organizations,name)}/></Field><Field label={t('search')}><input value={query} onChange={e=>setQuery(e.target.value)}/></Field></div>
  {!data?<p>{t('loading')}</p>:<DataTable rows={rows} columns={columns[tab]} emptyText={t('noData')}/>}
  {data&&<div className="facility-panel"><p className="muted">{t('stockNotice')}</p></div>}
  <Dialog open={!!open} title={t(open==='parts'?'newPart':open==='warehouses'?'newWarehouse':open==='bin'?'newBin':open==='stock'?'newMovement':'newRequest')} onClose={()=>!busy&&setOpen(false)}>
   <form className="facility-form" onSubmit={submit}><div className="form-grid">
    {['parts','warehouses'].includes(open)&&<>
     <Field label={t('organization')} required><Select required value={form.organization_id||''} onChange={v=>set('organization_id',v)} options={opts(data?.organizations.filter(x=>x.status==='active'&&can('inventory.manage',x.id)),name)}/></Field>
     {['name_ar','name_en'].map(key=><Field key={key} label={t(key==='name_ar'?'nameAr':'nameEn')} required><input required value={form[key]||''} onChange={e=>set(key,e.target.value)}/></Field>)}
    </>}
    {open==='parts'&&<>
     {['manufacturer','manufacturer_part_number','unit','category','barcode','description'].map(key=><Field key={key} label={t(({manufacturer_part_number:'manufacturerPartNumber'})[key]||key)}><input value={form[key]||''} onChange={e=>set(key,e.target.value)}/></Field>)}
     <Field label={t('criticality')}><Select value={form.criticality} onChange={v=>set('criticality',v)} options={['low','medium','high','critical'].map(v=>({value:v,label:t(v)}))}/></Field>
     {['min_qty','reorder_qty','lead_days'].map(key=><Field key={key} label={t(({min_qty:'minQty',reorder_qty:'reorderQty',lead_days:'leadDays'})[key])}><input type="number" min="0" step={key==='lead_days'?'1':'0.001'} value={form[key]} onChange={e=>set(key,e.target.value)}/></Field>)}
    </>}
    {open==='warehouses'&&<>
     <Field label={t('warehouseKind')}><Select value={form.kind} onChange={v=>set('kind',v)} options={['central','site','van'].map(v=>({value:v,label:t(v)}))}/></Field>
     <Field label={t('site')}><Select value={form.site_id} onChange={v=>set('site_id',v)} options={opts(data?.sites.filter(x=>x.organization_id===form.organization_id),name)}/></Field>
    </>}
    {open==='bin'&&<>
     <Field label={t('warehouse')} required><Select required value={form.warehouse_id} onChange={v=>set('warehouse_id',v)} options={opts(data?.warehouses.filter(x=>can('inventory.manage',x.organization_id)),name)}/></Field>
     <Field label={t('binCode')} required><input required value={form.code} onChange={e=>set('code',e.target.value)}/></Field>
     <Field label={t('description')}><input value={form.description} onChange={e=>set('description',e.target.value)}/></Field>
    </>}
    {open==='stock'&&<>
     <Field label={t('movementType')}><Select value={mode} onChange={setMode} options={['receipt','transfer','adjust_in','adjust_out'].map(v=>({value:v,label:t(v)}))}/></Field>
     <Field label={t('part')} required><Select required value={form.part_id} onChange={v=>set('part_id',v)} options={opts(data?.parts.filter(x=>x.status==='active'&&can('inventory.manage',x.organization_id)),x=>x.sku+' · '+name(x))}/></Field>
     <Field label={t('bin')} required><Select required value={form.bin_id} onChange={v=>set('bin_id',v)} options={opts(data?.bins.filter(x=>can('inventory.manage',x.organization_id)),x=>name(warehouse(x.warehouse_id))+' / '+x.code)}/></Field>
     {mode==='transfer'&&<Field label={t('destinationBin')} required><Select required value={form.to_bin_id} onChange={v=>set('to_bin_id',v)} options={opts(data?.bins.filter(x=>x.id!==form.bin_id&&x.organization_id===part(form.part_id)?.organization_id),x=>name(warehouse(x.warehouse_id))+' / '+x.code)}/></Field>}
     <Field label={t('quantity')} required><input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e=>set('quantity',e.target.value)}/></Field>
     <Field label={t('reference')} required><input required minLength={3} value={form.reference} onChange={e=>set('reference',e.target.value)}/></Field>
     <Field label={t('reason')}><textarea value={form.reason} onChange={e=>set('reason',e.target.value)}/></Field>
     <p className="muted span-2">{t('movementNotice')}</p>
    </>}
    {open==='requests'&&<>
     <Field label={t('workOrder')} required><Select required value={form.work_order_id} onChange={v=>set('work_order_id',v)} options={opts(data?.workOrders.filter(x=>!['closed','cancelled'].includes(x.status)&&can('inventory.request',x.organization_id)),x=>x.work_order_number+' · '+x.title)}/></Field>
     <Field label={t('part')} required><Select required value={form.part_id} onChange={v=>set('part_id',v)} options={opts(data?.parts.filter(x=>x.status==='active'&&x.organization_id===data?.workOrders.find(w=>w.id===form.work_order_id)?.organization_id),x=>x.sku+' · '+name(x))}/></Field>
     <Field label={t('quantity')} required><input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e=>set('quantity',e.target.value)}/></Field>
     <p className="muted span-2">{t('requestNotice')}</p>
    </>}
   </div><FormActions busy={busy} onCancel={()=>setOpen(false)}/></form>
  </Dialog>
 </section>
}
