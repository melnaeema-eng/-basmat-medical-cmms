import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadAll,save,active,display} from '../lib/facility'
import {Field,Choice,Select,Dialog,Notice,Status,FormActions} from '../components/FacilityFields'
import DataTable from '../components/DataTable'
const blank={name_ar:'',name_en:'',code:'',description:'',parent_id:'',status:'active'}
export default function AssetCategories(){
 const {can}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[org,setOrg]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState(''),[success,setSuccess]=useState(''),[form,setForm]=useState(blank),[editing,setEditing]=useState(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false)
 const reload=async()=>{try{setError('');setData(await loadAll())}catch(e){setError(e.message)}}
 useEffect(()=>{reload()},[])
 const rows=useMemo(()=>data?.categories.filter(r=>(!org||r.organization_id===org)&&(!search||[r.name_ar,r.name_en,r.code].join(' ').toLowerCase().includes(search.toLowerCase())))||[],[data,org,search])
 const start=(row=null)=>{if(row)setOrg(row.organization_id);setEditing(row);setForm(row?{...blank,...row,parent_id:row.parent_id||''}:{...blank,code:''});setOpen(true)}
 const submit=async e=>{e.preventDefault();setBusy(true);setError('')
  try{const organization_id=editing?.organization_id||org;if(!can('assets.manage',organization_id))throw Error(t('noPermission'))
   await save('bf_asset_categories',{organization_id,name_ar:form.name_ar.trim(),name_en:form.name_en.trim(),parent_id:form.parent_id||null,description:form.description||null,status:form.status},editing?.id)
   setOpen(false);await reload();setSuccess(t('saved'))}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const change=async(row,status)=>{if(!confirm(t(status==='archived'?'confirmArchive':'confirmRestore')))return;try{await save('bf_asset_categories',{status},row.id);await reload();setSuccess(t('saved'))}catch(e){setError(e.message)}}
 const cols=[{key:'code',label:t('code')},{key:'name',label:t('name'),render:r=>display(r,lang)},{key:'parent',label:t('parent'),render:r=>display(data.categories.find(x=>x.id===r.parent_id),lang)},{key:'status',label:t('status'),render:r=><Status value={r.status}/>},{key:'actions',label:t('actions'),render:r=>can('assets.manage',r.organization_id)&&<div className="row-actions"><button className="btn xs secondary" onClick={()=>start(r)}>{t('edit')}</button><button className="btn xs danger-soft" onClick={()=>change(r,r.status==='archived'?'active':'archived')}>{t(r.status==='archived'?'restore':'archive')}</button></div>}]
 return <section className="facility-module">
  <div className="page-head"><h1>{t('categories')}</h1><div className="row-actions"><button className="btn secondary" onClick={reload}>{t('refresh')}</button>{can('assets.manage',org||null)&&<button className="btn primary" disabled={!org} onClick={()=>start()}>{t('add')}</button>}</div></div>
  <Notice error={error} success={success}/>
  <div className="facility-panel filter-grid"><Field label={t('organization')}><Choice rows={active(data?.organizations)} lang={lang} value={org} onChange={setOrg}/></Field><Field label={t('search')}><input value={search} onChange={e=>setSearch(e.target.value)}/></Field></div>
  {data?<DataTable columns={cols} rows={rows} emptyText={t('noData')}/>:<p>{t('loading')}</p>}
  <Dialog open={open} title={editing?t('edit'):t('add')} onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}>
   <Field label={t('nameAr')} required><input required value={form.name_ar} onChange={e=>setForm({...form,name_ar:e.target.value})}/></Field>
   <Field label={t('nameEn')} required><input required value={form.name_en} onChange={e=>setForm({...form,name_en:e.target.value})}/></Field>
   <Field label={t('categoryCode')} required><input value={form.code||'Auto-generated on save / يُنشأ عند الحفظ'} readOnly/></Field>
   <Field label={t('parent')}><Choice rows={active(data?.categories).filter(r=>r.organization_id===org&&r.id!==editing?.id)} lang={lang} value={form.parent_id} onChange={v=>setForm({...form,parent_id:v})}/></Field>
   <Field label={t('description')} wide><textarea value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
   <Field label={t('status')}><Select value={form.status} onChange={v=>setForm({...form,status:v})} options={['active','inactive','archived'].map(v=>({value:v,label:t(v)}))}/></Field>
   <FormActions busy={busy} onCancel={()=>setOpen(false)}/>
  </form></Dialog>
 </section>
}
