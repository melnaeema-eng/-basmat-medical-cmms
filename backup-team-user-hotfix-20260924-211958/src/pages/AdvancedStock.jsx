import {useEffect,useMemo,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadAdvanced,stockAction,qty,available} from '../lib/advancedStock'
import {Field,Select,Dialog,Notice,FormActions,Status} from '../components/FacilityFields'
import DataTable from '../components/DataTable'
export default function AdvancedStock(){
 const {can}=useAuth(),{t,lang}=useLanguage(),navigate=useNavigate()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const [org,setOrg]=useState(''),[query,setQuery]=useState(''),[tab,setTab]=useState('requests'),[open,setOpen]=useState(false),[form,setForm]=useState({work_order_id:'',reason:''})
 const load=async()=>{setError('');try{setData(await loadAdvanced())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 const name=x=>lang==='ar'?x?.name_ar||x?.name_en||x?.name:x?.name_en||x?.name_ar||x?.name
 const opts=(rows,label)=>[{value:'',label:t('select')},...(rows||[]).map(x=>({value:x.id,label:label(x)}))]
 const rows=useMemo(()=>{
  const source=tab==='requests'?data?.requests:tab==='allocations'?data?.lots:data?.events
  return (source||[]).filter(x=>(!org||x.organization_id===org)&&(!query||Object.values(x).some(v=>typeof v==='string'&&v.toLowerCase().includes(query.toLowerCase()))))
 },[data,org,query,tab])
 const part=id=>data?.parts.find(x=>x.id===id)
 const wh=id=>data?.warehouses.find(x=>x.id===id)
 const bin=id=>data?.bins.find(x=>x.id===id)
 const submit=async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('')
  try{const id=await stockAction('create',null,form);setOpen(false);navigate('/advanced-stock/'+id)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const columns={
  requests:[
   {key:'number',label:t('requestNumber'),render:x=><Link to={'/advanced-stock/'+x.id}>{x.number}</Link>},
   {key:'wo',label:t('workOrder'),render:x=>data.workOrders.find(w=>w.id===x.work_order_id)?.work_order_number},
   {key:'reason',label:t('reason')},{key:'status',label:t('status'),render:x=><Status value={x.status}/>},
   {key:'created_at',label:t('createdAt'),render:x=>new Date(x.created_at).toLocaleString(lang)}
  ],
  allocations:[
   {key:'part',label:t('part'),render:x=>part(x.part_id)?.sku+' · '+name(part(x.part_id))},
   {key:'owner',label:t('stockOwner'),render:x=>x.owner_client_id?data.clients.find(c=>c.id===x.owner_client_id)?.name:t('companyStock')},
   {key:'warehouse',label:t('warehouse'),render:x=>name(wh(x.warehouse_id))+' / '+(bin(x.bin_id)?.code||'')},
   {key:'lot',label:t('lotCode'),render:x=>x.lot_code||'—'},{key:'serial',label:t('serialNumber'),render:x=>x.serial_number||'—'},
   {key:'expires_on',label:t('expiresOn')},{key:'quantity',label:t('quantity'),render:x=>qty(x.quantity)},
   {key:'reserved',label:t('reserved'),render:x=>qty(x.reserved)},
   {key:'available',label:t('available'),render:x=>qty(available(x))}
  ],
  events:[
   {key:'created_at',label:t('createdAt'),render:x=>new Date(x.created_at).toLocaleString(lang)},
   {key:'action',label:t('actions'),render:x=>t(x.action)},
   {key:'request',label:t('requestNumber'),render:x=><Link to={'/advanced-stock/'+x.request_id}>{data.requests.find(r=>r.id===x.request_id)?.number||x.request_id}</Link>},
   {key:'quantity',label:t('quantity'),render:x=>qty(x.quantity)},
   {key:'actor_id',label:t('createdAt'),render:x=>x.actor_id}
  ]
 }
 return <section className="facility-module">
  <div className="page-head"><h1>{t('advancedStock')}</h1><div className="row-actions"><button className="btn secondary" onClick={load}>{t('refresh')}</button>{can('inventory.request')&&tab==='requests'&&<button className="btn primary" onClick={()=>{setForm({work_order_id:'',reason:''});setOpen(true)}}>{t('newAdvancedRequest')}</button>}</div></div>
  <Notice error={error} success={success}/>
  <div className="row-actions">{[['requests','advancedRequests'],['allocations','allocations'],['events','history']].map(([key,label])=><button key={key} className={'btn '+(tab===key?'primary':'secondary')} onClick={()=>{setTab(key);setQuery('')}}>{t(label)} ({data?.[key==='allocations'?'lots':key]?.length||0})</button>)}</div>
  <div className="facility-panel filter-grid"><Field label={t('organization')}><Select value={org} onChange={setOrg} options={opts(data?.organizations,name)}/></Field><Field label={t('search')}><input value={query} onChange={e=>setQuery(e.target.value)}/></Field></div>
  {!data?<p>{t('loading')}</p>:<DataTable rows={rows} columns={columns[tab]} emptyText={t('noData')}/>}
  <div className="facility-panel"><p className="muted">{t('stockNotice')}</p></div>
  <Dialog open={open} title={t('newAdvancedRequest')} onClose={()=>!busy&&setOpen(false)}>
   <form className="facility-form" onSubmit={submit}><div className="form-grid">
    <Field label={t('workOrder')} required><Select required value={form.work_order_id} onChange={v=>setForm(f=>({...f,work_order_id:v}))} options={opts(data?.workOrders.filter(w=>!['closed','cancelled'].includes(w.status)&&can('inventory.request',w.organization_id)),w=>w.work_order_number+' · '+w.title)}/></Field>
    <Field label={t('reason')} required><textarea required minLength={5} value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/></Field>
   </div><p className="muted">{t('requestNotice')}</p><FormActions busy={busy} onCancel={()=>setOpen(false)}/></form>
  </Dialog>
 </section>
}
