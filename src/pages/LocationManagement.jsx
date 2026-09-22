import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadAll,save,active,display,levels,tables} from '../lib/facility'
import {Field,Choice,Select,Dialog,Notice,Status,FormActions} from '../components/FacilityFields'
import DataTable from '../components/DataTable'
const blank={name_ar:'',name_en:'',code:'',description:'',status:'active',level_no:''}
export default function LocationManagement(){
 const {can}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [org,setOrg]=useState(''),[client,setClient]=useState(''),[site,setSite]=useState('')
 const [level,setLevel]=useState('buildings'),[search,setSearch]=useState(''),[form,setForm]=useState(blank),[editing,setEditing]=useState(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false)
 const reload=async()=>{try{setError('');setData(await loadAll())}catch(e){setError(e.message)}}
 useEffect(()=>{reload()},[])
 const config=levels.find(l=>l.key===level)
 const sites=active(data?.sites).filter(s=>(!org||s.organization_id===org)&&(!client||s.client_id===client))
 const parents=level==='buildings'?data?.sites.filter(s=>s.id===site)||[]:(data?.[config.previous]||[]).filter(r=>r.site_id===site)
 const rows=useMemo(()=>data?.[level]?.filter(r=>(!org||r.organization_id===org)&&(!client||data.sites.find(s=>s.id===r.site_id)?.client_id===client)&&(!site||r.site_id===site)&&(!search||[r.name,r.name_ar,r.name_en,r.code].join(' ').toLowerCase().includes(search.toLowerCase())))||[],[data,level,org,client,site,search])
 const start=(row=null)=>{
  if(row){setOrg(row.organization_id);setSite(row.site_id);setClient(data.sites.find(s=>s.id===row.site_id)?.client_id||'')}
  setEditing(row);setForm(row?{...blank,...row,level_no:row.level_no??''}:{...blank,code:'',[config.parent]:level==='buildings'?site:''})
  setOpen(true);setError('')
 }
 const submit=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   const parent=(level==='buildings'?data.sites:data[config.previous]).find(r=>r.id===form[config.parent])
   if(!parent)throw Error(t('required'))
   const targetSite=level==='buildings'?parent:data.sites.find(s=>s.id===parent.site_id)
   if(!targetSite||!can('locations.manage',targetSite.organization_id))throw Error(t('noPermission'))
   const payload={organization_id:targetSite.organization_id,site_id:targetSite.id,[config.parent]:parent.id,name:form.name_en.trim(),name_ar:form.name_ar.trim(),name_en:form.name_en.trim(),description:form.description||null,status:form.status}
   if(level==='floors')payload.level_no=form.level_no===''?null:Number(form.level_no)
   await save(tables[level],payload,editing?.id);setOpen(false);await reload();setSuccess(t('saved'))
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const change=async(row,status)=>{if(!confirm(t(status==='archived'?'confirmArchive':'confirmRestore')))return;try{await save(tables[level],{status},row.id);await reload();setSuccess(t('saved'))}catch(e){setError(e.message)}}
 const cols=[{key:'code',label:t('code')},{key:'name',label:t('name'),render:r=>display(r,lang)},{key:'parent',label:t('parent'),render:r=>display(data[config.previous].find(x=>x.id===r[config.parent]),lang)},{key:'status',label:t('status'),render:r=><Status value={r.status}/>},{key:'actions',label:t('actions'),render:r=>can('locations.manage',r.organization_id)&&<div className="row-actions"><button className="btn xs secondary" onClick={()=>start(r)}>{t('edit')}</button><button className="btn xs danger-soft" onClick={()=>change(r,r.status==='archived'?'active':'archived')}>{t(r.status==='archived'?'restore':'archive')}</button></div>}]
 return <section className="facility-module">
  <div className="page-head"><h1>{t('locations')}</h1><div className="row-actions"><button className="btn secondary" onClick={reload}>{t('refresh')}</button>{can('locations.manage',org||null)&&<button className="btn primary" disabled={!site} onClick={()=>start()}>{t('add')}</button>}</div></div>
  <Notice error={error} success={success}/>
  <div className="facility-panel filter-grid">
   <Field label={t('organization')}><Choice rows={active(data?.organizations)} lang={lang} value={org} onChange={v=>{setOrg(v);setClient('');setSite('')}}/></Field>
   <Field label={t('client')}><Choice rows={active(data?.clients).filter(c=>!org||c.organization_id===org)} lang={lang} value={client} onChange={v=>{setClient(v);setSite('')}}/></Field>
   <Field label={t('site')}><Choice rows={sites} lang={lang} value={site} onChange={setSite}/></Field>
  </div>
  <div className="facility-tabs">{levels.map(l=><button key={l.key} className={level===l.key?'selected':''} onClick={()=>{setLevel(l.key);setSearch('')}}>{t(l.key)}</button>)}</div>
  <div className="facility-toolbar"><input placeholder={t('search')} value={search} onChange={e=>setSearch(e.target.value)}/><span>{rows.length}</span></div>
  {data?<DataTable columns={cols} rows={rows} emptyText={t('noData')}/>:<p>{t('loading')}</p>}
  <Dialog open={open} title={editing?t('edit'):t('add')} onClose={()=>setOpen(false)}>
   <form className="form-grid" onSubmit={submit}>
    <Field label={t('parent')} required><Choice rows={parents} value={form[config.parent]} lang={lang} required onChange={v=>setForm({...form,[config.parent]:v})}/></Field>
    <Field label={t('code')}><input value={form.code||'Auto-generated on save / يُنشأ عند الحفظ'} readOnly/></Field>
    <Field label={t('nameAr')} required><input required value={form.name_ar} onChange={e=>setForm({...form,name_ar:e.target.value})}/></Field>
    <Field label={t('nameEn')} required><input required value={form.name_en} onChange={e=>setForm({...form,name_en:e.target.value})}/></Field>
    {level==='floors'&&<Field label={t('code')}><input type="number" value={form.level_no} onChange={e=>setForm({...form,level_no:e.target.value})}/></Field>}
    <Field label={t('description')} wide><textarea value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
    <Field label={t('status')}><Select value={form.status} onChange={v=>setForm({...form,status:v})} options={['active','inactive','archived'].map(v=>({value:v,label:t(v)}))}/></Field>
    <FormActions busy={busy} onCancel={()=>setOpen(false)}/>
   </form>
  </Dialog>
 </section>
}
