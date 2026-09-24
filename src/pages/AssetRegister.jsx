import {useEffect,useMemo,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadAll,save,active,display,locationLabel} from '../lib/facility'
import {Field,Choice,Select,Dialog,Notice,Status} from '../components/FacilityFields'
import AssetEditor from '../components/AssetEditor'
import DataTable from '../components/DataTable'
export default function AssetRegister(){
 const {can}=useAuth(),{t,lang}=useLanguage(),navigate=useNavigate()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [org,setOrg]=useState(''),[client,setClient]=useState(''),[site,setSite]=useState(''),[category,setCategory]=useState(''),[status,setStatus]=useState(''),[query,setQuery]=useState('')
 const [record,setRecord]=useState(null),[open,setOpen]=useState(false)
 const reload=async()=>{try{setError('');setData(await loadAll())}catch(e){setError(e.message)}}
 useEffect(()=>{reload()},[])
 const rows=useMemo(()=>data?.assets.filter(a=>(!org||a.organization_id===org)&&(!client||a.client_id===client)&&(!site||a.site_id===site)&&(!category||a.category_id===category)&&(!status||a.status===status)&&(!query||[a.asset_tag,a.name_ar,a.name_en,a.serial_number,a.manufacturer,a.model].join(' ').toLowerCase().includes(query.toLowerCase())))||[],[data,org,client,site,category,status,query])
 const start=(row=null)=>{setRecord(row);setOpen(true);setError('')}
 const change=async(row,next)=>{if(!confirm(t(next==='archived'?'confirmArchive':'confirmRestore')))return;try{await save('bf_assets',{status:next},row.id);await reload();setSuccess(t('saved'))}catch(e){setError(e.message)}}
 const cols=[
  {key:'asset_tag',label:t('assetTag'),render:a=><Link to={'/assets/'+a.id}>{a.asset_tag}</Link>},
  {key:'name',label:t('name'),render:a=>display(a,lang)},
  {key:'location',label:t('site'),render:a=>display(data.sites.find(s=>s.id===a.site_id),lang)},
  {key:'category',label:t('category'),render:a=>display(data.categories.find(c=>c.id===a.category_id),lang)},
  {key:'criticality',label:t('criticality'),render:a=><Status value={a.criticality}/>},
  {key:'status',label:t('status'),render:a=><Status value={a.status}/>},
  {key:'actions',label:t('actions'),render:a=><div className="row-actions"><button className="btn xs primary" onClick={()=>navigate('/asset-passport/'+a.id)}>{lang==='ar'?'\u062c\u0648\u0627\u0632 \u0627\u0644\u062c\u0647\u0627\u0632 \u0627\u0644\u0637\u0628\u064a':'Medical Device Passport'}</button><button className="btn xs secondary" onClick={()=>navigate('/assets/'+a.id)}>{t('details')}</button>{can('assets.manage',a.organization_id)&&<><button className="btn xs secondary" onClick={()=>start(a)}>{t('edit')}</button><button className="btn xs danger-soft" onClick={()=>change(a,a.status==='archived'?'active':'archived')}>{t(a.status==='archived'?'restore':'archive')}</button></>}</div>}
 ]
 const today=new Date(),in30=new Date(today.getTime()+30*86400000)
 const stats=[['totalAssets',data?.assets.filter(a=>a.status!=='archived').length||0],['criticalAssets',data?.assets.filter(a=>a.status!=='archived'&&a.criticality==='critical').length||0],['warrantyDue',data?.assets.filter(a=>a.status!=='archived'&&a.warranty_end&&new Date(a.warranty_end)>=today&&new Date(a.warranty_end)<=in30).length||0],['archivedAssets',data?.assets.filter(a=>a.status==='archived').length||0]]
 return <section className="facility-module">
  <div className="page-head"><h1>{t('assets')}</h1><div className="row-actions"><button className="btn secondary" onClick={reload}>{t('refresh')}</button>{can('assets.manage',org||null)&&<button className="btn primary" onClick={()=>start()} disabled={!data?.sites.length}>{t('newAsset')}</button>}</div></div>
  <Notice error={error} success={success}/>
  {data&&<><div className="stats-grid facility-stats">{stats.map(([key,value])=><div className="stat-card" key={key}><span>{t(key)}</span><strong>{value}</strong></div>)}</div>
  <div className="facility-panel filter-grid">
   <Field label={t('organization')}><Choice rows={active(data.organizations)} lang={lang} value={org} onChange={v=>{setOrg(v);setClient('');setSite('');setCategory('')}}/></Field>
   <Field label={t('client')}><Choice rows={active(data.clients).filter(c=>!org||c.organization_id===org)} lang={lang} value={client} onChange={v=>{setClient(v);setSite('')}}/></Field>
   <Field label={t('site')}><Choice rows={active(data.sites).filter(s=>(!org||s.organization_id===org)&&(!client||s.client_id===client))} lang={lang} value={site} onChange={setSite}/></Field>
   <Field label={t('category')}><Choice rows={active(data.categories).filter(c=>!org||c.organization_id===org)} lang={lang} value={category} onChange={setCategory}/></Field>
   <Field label={t('status')}><Select value={status} onChange={setStatus} placeholder={t('all')} options={['active','inactive','archived'].map(v=>({value:v,label:t(v)}))}/></Field>
   <Field label={t('search')}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('assetTag')+' / '+t('serialNumber')}/></Field>
  </div><div className="facility-toolbar"><span>{rows.length} {t('assets')}</span></div><DataTable columns={cols} rows={rows} emptyText={t('noData')}/></>}
  {!data&&<p>{t('loading')}</p>}
  <Dialog open={open} title={record?t('edit'):t('newAsset')} onClose={()=>setOpen(false)}>
   {data&&<AssetEditor key={record?.id||'new'} record={record} data={data} initial={{organization_id:org,client_id:client,site_id:site}} onCancel={()=>setOpen(false)} onSaved={async a=>{setOpen(false);await reload();setSuccess(t('saved'));navigate('/assets/'+a.id)}}/>}
  </Dialog>
 </section>
}
