import {useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'
import {useMasterRecords} from '../lib/useMasterRecords'
import {isActive,labelFor} from '../lib/masterRecords'
import SiteGeoFields from '../components/SiteGeoFields'

const configs={
 organizations:{
  permission:'organizations',empty:{name:'',code:'',status:'active'},
  fields:[['name','text',true],['code','reference'],['status','status']]
 },
 clients:{
  permission:'clients',empty:{organization_id:'',name:'',code:'',email:'',phone:'',status:'active'},
  fields:[['organization_id','organization',true],['name','text',true],['code','reference'],['email','email'],['phone','tel'],['status','status']]
 },
 contracts:{
  permission:'contracts',empty:{organization_id:'',client_id:'',contract_number:'',contract_type:'comprehensive',start_date:'',end_date:'',contract_value:'',status:'draft'},
  fields:[['organization_id','organization',true],['client_id','client',true],['contract_number','text',true],['contract_type','contractType'],['start_date','date'],['end_date','date'],['contract_value','number'],['status','status']]
 },
 sites:{
  permission:'sites',empty:{organization_id:'',client_id:'',contract_id:'',name:'',code:'',city:'',address:'',status:'active'},
  fields:[['organization_id','organization',true],['client_id','client',true],['contract_id','contract'],['name','text',true],['code','reference'],['city','text'],['address','text'],['status','status']]
 }
}
const statuses={organizations:['active','inactive','archived'],clients:['active','inactive','archived'],contracts:['draft','active','suspended','expired','closed','archived'],sites:['active','inactive','archived']}
const contractTypes=['comprehensive','nonComprehensive','ppm','corrective','manpower','mixed']
const fieldNames={organization_id:'organization',client_id:'client',contract_id:'contractNumber',contract_number:'contractNumber',contract_type:'contractType',start_date:'startDate',end_date:'endDate',contract_value:'contractValue'}

export default function MasterManagement({kind}){
 const {t}=useLanguage(),{can}=useAuth()
 const cfg=configs[kind]
 const state=useMasterRecords(kind)
 const {rows,bundle,loading,busy,error,success,setError,setSuccess,refresh,persist}=state
 const [form,setForm]=useState(cfg.empty),[editing,setEditing]=useState(null),[open,setOpen]=useState(false)
 const [search,setSearch]=useState(''),[filterOrg,setFilterOrg]=useState(''),[filterClient,setFilterClient]=useState(''),[filterStatus,setFilterStatus]=useState('')
 const name=(key)=>t(fieldNames[key]||key)
 const orgs=bundle.organizations||[],clients=bundle.clients||[],contracts=bundle.contracts||[]
 const allowedOrg=o=>can(cfg.permission+'.view',o.id)||can(cfg.permission+'.manage',o.id)
 const canManage=r=>can(cfg.permission+'.manage',kind==='organizations'?r.id:r.organization_id)
 const visible=useMemo(()=>rows.filter(r=>{
  if(filterOrg&&(kind==='organizations'?r.id:r.organization_id)!==filterOrg)return false
  if(filterClient&&r.client_id!==filterClient&&(kind!=='clients'||r.id!==filterClient))return false
  if(filterStatus&&r.status!==filterStatus)return false
  return !search||Object.values(r).some(v=>typeof v==='string'&&v.toLowerCase().includes(search.toLowerCase()))
 }),[rows,search,filterOrg,filterClient,filterStatus,kind])
 const start=(row=null)=>{
  setEditing(row?.id||null)
  const initial={...cfg.empty,...(row||{})}
  for(const k of Object.keys(cfg.empty))if(initial[k]===null||initial[k]===undefined)initial[k]=''
  if(!row&&kind!=='organizations')initial.organization_id=filterOrg||orgs.filter(isActive).find(o=>can(cfg.permission+'.manage',o.id))?.id||''
  if(!row&&kind==='sites')initial.client_id=filterClient||''
  if(!row)initial.code='';
  setForm(initial);setOpen(true);setError('');setSuccess('')
 }
 const set=(key,value)=>{
  setForm(f=>({...f,[key]:value,...(key==='organization_id'?{client_id:'',contract_id:''}:key==='client_id'?{contract_id:''}:{})}))
 }
 const submit=async e=>{
  e.preventDefault()
  if(busy)return
  try{
   if(!(kind==='organizations'?can('organizations.manage'):canManage({organization_id:form.organization_id})))throw Error(t('noPermission'))
   const saved=await persist(form,editing)
   setOpen(false);setEditing(null);setForm(cfg.empty)
   setSuccess(t('saved'))
   // A new record is never hidden by an old organization/client/status filter.
   if(kind==='organizations')setFilterOrg('')
   else setFilterOrg(saved.organization_id||'')
   if(kind==='clients')setFilterClient('')
   else if(saved.client_id)setFilterClient(saved.client_id)
   setFilterStatus('');setSearch('')
  }catch(e){setError(e.message)}
 }
 const archive=async row=>{
  const next=row.status==='archived'?'active':'archived'
  if(!confirm(t(next==='archived'?'confirmArchive':'confirmRestore')))return
  try{await persist({...row,status:next},row.id);setSuccess(t('saved'))}catch(e){setError(e.message)}
 }
 const options=(key)=>{
  if(key==='status')return statuses[kind].map(v=>({id:v,label:t(v)}))
  if(key==='contract_type')return contractTypes.map(v=>({id:v,label:t(v)}))
  if(key==='organization_id')return orgs.filter(o=>isActive(o)||o.id===form.organization_id).filter(o=>can(cfg.permission+'.manage',o.id)).map(o=>({id:o.id,label:o.name}))
  if(key==='client_id')return clients.filter(c=>c.organization_id===form.organization_id&&(isActive(c)||c.id===form.client_id)).map(c=>({id:c.id,label:c.name}))
  if(key==='contract_id')return contracts.filter(c=>c.organization_id===form.organization_id&&c.client_id===form.client_id&&(isActive(c)||c.id===form.contract_id)).map(c=>({id:c.id,label:c.contract_number}))
  return []
 }
 const renderField=([key,type,required])=>{
  const value=form[key]??''
  return <label key={key} className={key==='address'?'span-2':''}>{name(key)}
   {type==='reference'?<input value={value||'Auto-generated on save / يُنشأ عند الحفظ'} readOnly aria-label={name(key)} />:
   ['organization','client','contract','status','contractType'].includes(type)?
    <select required={!!required} value={value} disabled={busy||(editing&&key==='organization_id')||(editing&&key==='client_id'&&['contracts','sites'].includes(kind))} onChange={e=>set(key,e.target.value)}>
     <option value="">{t('select')}</option>{options(key).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
    </select>:
    <input type={type} required={!!required} min={type==='number'?'0':undefined} step={type==='number'?'0.01':undefined} value={value} disabled={busy} onChange={e=>set(key,e.target.value)}/>}
  </label>
 }
 const col=(key,label,render)=>({key,label:t(label),render})
 const columns=kind==='organizations'?[col('name','name'),col('code','code')]:
 kind==='clients'?[col('name','name'),col('organization','organization',r=>labelFor(orgs,r.organization_id)),col('email','email'),col('phone','phone')]:
 kind==='contracts'?[col('contract_number','contractNumber'),col('client','client',r=>labelFor(clients,r.client_id)),col('contract_type','contractType',r=>t(r.contract_type)),col('start_date','startDate'),col('end_date','endDate')]:
 [col('name','siteName'),col('organization','organization',r=>labelFor(orgs,r.organization_id)),col('client','client',r=>labelFor(clients,r.client_id)),col('city','city')]
 columns.push(col('status','status',r=>t(r.status)))
 columns.push(col('actions','actions',r=>canManage(r)&&<div className="row-actions"><button className="btn xs secondary" onClick={()=>start(r)}>{t('edit')}</button><button className="btn xs danger-soft" onClick={()=>archive(r)}>{t(r.status==='archived'?'restore':'delete')}</button></div>))
 const allowCreate=kind==='organizations'?can('organizations.manage'):orgs.some(o=>isActive(o)&&can(cfg.permission+'.manage',o.id))
 return <section className="facility-module">
  <div className="page-head"><h1>{t(kind)}</h1><div className="row-actions"><button className="btn secondary" onClick={()=>refresh()} disabled={busy||loading}>{t('refresh')}</button>{allowCreate&&<button className="btn primary" onClick={()=>start()} disabled={busy}>{t('add')}</button>}</div></div>
  {error&&<div className="alert error" role="alert">{error}<button type="button" className="btn xs secondary" onClick={()=>refresh()}>{t('refresh')}</button></div>}
  {success&&<div className="alert success" role="status">{success==='saved'?t('saved'):success}</div>}
  <div className="facility-panel filter-grid">
   <label>{t('search')}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('search')}/></label>
   <label>{t('organization')}<select value={filterOrg} onChange={e=>{setFilterOrg(e.target.value);setFilterClient('')}}><option value="">{t('all')}</option>{orgs.filter(allowedOrg).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
   {kind!=='organizations'&&<label>{t('client')}<select value={filterClient} onChange={e=>setFilterClient(e.target.value)}><option value="">{t('all')}</option>{clients.filter(c=>!filterOrg||c.organization_id===filterOrg).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
   <label>{t('status')}<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="">{t('all')}</option>{statuses[kind].map(v=><option key={v} value={v}>{t(v)}</option>)}</select></label>
  </div>
  <div className="facility-toolbar"><span>{visible.length} / {rows.length}</span>{loading&&<span>{t('loading')}</span>}</div>
  <DataTable columns={columns} rows={visible} emptyText={loading?t('loading'):t('noData')}/>
  <Modal open={open} title={editing?t('edit'):t('add')} onClose={()=>!busy&&setOpen(false)}>
   <form onSubmit={submit} className="form-grid">
   <SiteGeoFields kind={kind} form={form} set={set} lang={lang}/>
    {error&&<div className="alert error span-2" role="alert">{error}</div>}
    {cfg.fields.map(renderField)}
    <div className="form-actions"><button type="button" className="btn secondary" disabled={busy} onClick={()=>setOpen(false)}>{t('cancel')}</button><button className="btn primary" disabled={busy}>{busy?t('loading'):t('save')}</button></div>
   </form>
  </Modal>
 </section>
}
