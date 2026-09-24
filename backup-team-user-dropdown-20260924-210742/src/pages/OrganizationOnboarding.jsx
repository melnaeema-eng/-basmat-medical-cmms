import {useEffect,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import AutoQr from '../components/AutoQr'
import {loadOrganizations,createOrganization,updateOrganization} from '../lib/organizationOnboarding'

const empty={name_ar:'',name_en:'',organization_type:'owner',registration_no:'',vat_no:'',email:'',phone:'',city:'',address:''}
const types=['owner','maintenance_contractor','consultant','subcontractor','service_provider','government_entity','private_company']

export default function OrganizationOnboarding(){
 const {t}=useLanguage(),{profile}=useAuth()
 const [rows,setRows]=useState([]),[form,setForm]=useState(empty),[editing,setEditing]=useState(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setRows(await loadOrganizations())}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const set=(k,v)=>setForm(x=>({...x,[k]:v}))
 const edit=r=>{setEditing(r.id);setForm({name_ar:r.name_ar||'',name_en:r.name_en||'',organization_type:r.organization_type||'owner',registration_no:r.registration_no||'',vat_no:r.vat_no||'',email:r.email||'',phone:r.phone||'',city:r.city||'',address:r.address||''});setTimeout(()=>document.getElementById('organization-onboarding-form')?.scrollIntoView({behavior:'smooth',block:'start'}),0)}
 const reset=()=>{setEditing(null);setForm(empty)}
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{
  if(editing)await updateOrganization({...form,id:editing});else await createOrganization(form)
  reset();await load()
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('orgOnboardingTitle')}</h1><p className="muted">{t('orgAutoNote')}</p></div><button className="btn secondary" onClick={load}>{t('orgRefresh')}</button></div>
  {error&&<div className="alert error">{error}</div>}
  {(profile?.is_super_admin||editing)&&<form id="organization-onboarding-form" className="facility-panel" onSubmit={submit}><h2>{editing?t('orgEdit'):t('orgAdd')}</h2><div className="form-grid">
   <label>{t('orgType')}<select value={form.organization_type} onChange={e=>set('organization_type',e.target.value)}>{types.map(x=><option key={x} value={x}>{t(x)}</option>)}</select></label>
   <label>{t('orgNameAr')}<input value={form.name_ar} onChange={e=>set('name_ar',e.target.value)}/></label>
   <label>{t('orgNameEn')}<input value={form.name_en} onChange={e=>set('name_en',e.target.value)}/></label>
   <label>{t('orgReg')}<input value={form.registration_no} onChange={e=>set('registration_no',e.target.value)}/></label>
   <label>{t('orgVat')}<input value={form.vat_no} onChange={e=>set('vat_no',e.target.value)}/></label>
   <label>{t('orgEmail')}<input type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></label>
   <label>{t('orgPhone')}<input value={form.phone} onChange={e=>set('phone',e.target.value)}/></label>
   <label>{t('orgCity')}<input value={form.city} onChange={e=>set('city',e.target.value)}/></label>
   <label className="span-2">{t('orgAddress')}<input value={form.address} onChange={e=>set('address',e.target.value)}/></label>
  </div><div className="form-actions">{editing&&<button type="button" className="btn secondary" onClick={reset}>Cancel</button>}<button className="btn primary" disabled={busy}>{t('orgSave')}</button></div></form>}
  <div className="security-check-list">{rows.map(r=><article className="facility-panel" key={r.id}><div className="page-head"><div><strong>{r.name}</strong><p className="muted">{r.code} · {t(r.organization_type||'private_company')}</p></div><button type="button" className="btn xs secondary" onClick={()=>edit(r)} disabled={busy}>{t('orgEdit')}</button></div><div className="form-grid">
   <div><b>{t('orgReg')}</b><p>{r.registration_no||'—'}</p></div><div><b>{t('orgVat')}</b><p>{r.vat_no||'—'}</p></div><div><b>{t('orgEmail')}</b><p>{r.email||'—'}</p></div><div><b>{t('orgPhone')}</b><p>{r.phone||'—'}</p></div>
   <div><b>{t('orgCity')}</b><p>{r.city||'—'}</p></div><div><b>{t('orgCode')}</b><p>{r.code}</p></div><div><b>{t('orgQr')}</b><AutoQr value={r.qr_payload} size={120}/></div>
  </div></article>)}</div>
 </section>
}
