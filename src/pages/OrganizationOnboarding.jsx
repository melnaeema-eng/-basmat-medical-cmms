import {useEffect,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import AutoQr from '../components/AutoQr'
import {supabase} from '../lib/supabaseClient'
import {loadOrganizations,createOrganization,updateOrganization} from '../lib/organizationOnboarding'

const empty={name_ar:'',name_en:'',organization_type:'owner',registration_no:'',vat_no:'',email:'',phone:'',city:'',address:''}
const types=['owner','maintenance_contractor','consultant','subcontractor','service_provider','government_entity','private_company']

export default function OrganizationOnboarding(){
 const {t}=useLanguage(),{profile}=useAuth()
 const [rows,setRows]=useState([]),[form,setForm]=useState(empty),[editing,setEditing]=useState(null)
 const [medicalLinks,setMedicalLinks]=useState([]),[medicalCompanies,setMedicalCompanies]=useState([]),[medicalProjects,setMedicalProjects]=useState([]),[medicalSites,setMedicalSites]=useState([])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const orgRows=await loadOrganizations()
   setRows(orgRows)

   const [linksRes,companiesRes,sitesRes]=await Promise.all([
    supabase.from('bf_med_project_service_companies')
     .select('id,organization_id,project_id,site_id,company_id,manufacturer_id,asset_type_id,relationship_role,contract_reference,status')
     .eq('status','active'),
    supabase.from('bf_med_service_companies')
     .select('id,code,name_ar,name_en,company_type,specialties,status')
     .eq('status','active'),
    supabase.from('bf_sites')
     .select('id,organization_id,name,status')
     .eq('status','active')
   ])
   if(linksRes.error)throw linksRes.error
   if(companiesRes.error)throw companiesRes.error
   if(sitesRes.error)throw sitesRes.error

   setMedicalLinks(linksRes.data||[])
   setMedicalCompanies(companiesRes.data||[])
   setMedicalSites(sitesRes.data||[])

   const batches=await Promise.all((orgRows||[]).map(async org=>{
    const {data,error}=await supabase.rpc('bf35_structure',{p_org:org.id})
    if(error)return[]
    return (data?.projects||[]).map(p=>({...p,organization_id:p.organization_id||org.id}))
   }))
   setMedicalProjects(batches.flat())
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 useEffect(()=>{load()},[])
 const set=(k,v)=>setForm(x=>({...x,[k]:v}))
 const edit=r=>{setEditing(r.id);setForm({name_ar:r.name_ar||'',name_en:r.name_en||'',organization_type:r.organization_type||'owner',registration_no:r.registration_no||'',vat_no:r.vat_no||'',email:r.email||'',phone:r.phone||'',city:r.city||'',address:r.address||''});setTimeout(()=>document.getElementById('organization-onboarding-form')?.scrollIntoView({behavior:'smooth',block:'start'}),0)}
 const reset=()=>{setEditing(null);setForm(empty)}
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{
  if(editing)await updateOrganization({...form,id:editing});else await createOrganization(form)
  reset();await load()
 }catch(e){setError(e.message)}finally{setBusy(false)}}

 const linkedMedicalForOrg=(orgId)=>medicalLinks
  .filter(x=>x.organization_id===orgId)
  .map(x=>({
   ...x,
   company:medicalCompanies.find(c=>c.id===x.company_id),
   project:medicalProjects.find(p=>p.id===x.project_id),
   site:medicalSites.find(s=>s.id===x.site_id)
  }))
  .filter(x=>x.company)

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

  <div className="security-check-list">{rows.map(r=>{
   const linkedMedical=linkedMedicalForOrg(r.id)
   const companyCount=new Set(linkedMedical.map(x=>x.company.id)).size
   return <article className="facility-panel" key={r.id}>
    <div className="page-head">
     <div><strong>{r.name}</strong><p className="muted">{r.code} · {t(r.organization_type||'private_company')}</p></div>
     <button type="button" className="btn xs secondary" onClick={()=>edit(r)} disabled={busy}>{t('orgEdit')}</button>
    </div>
    <div className="form-grid">
     <div><b>{t('orgReg')}</b><p>{r.registration_no||'—'}</p></div>
     <div><b>{t('orgVat')}</b><p>{r.vat_no||'—'}</p></div>
     <div><b>{t('orgEmail')}</b><p>{r.email||'—'}</p></div>
     <div><b>{t('orgPhone')}</b><p>{r.phone||'—'}</p></div>
     <div><b>{t('orgCity')}</b><p>{r.city||'—'}</p></div>
     <div><b>{t('orgCode')}</b><p>{r.code}</p></div>
     <div><b>{t('orgQr')}</b><AutoQr value={r.qr_payload} size={120}/></div>
    </div>

    <div style={{marginTop:18,borderTop:'1px solid #e7ebef',paddingTop:14}}>
     <div className="page-head" style={{marginBottom:8}}>
      <div>
       <strong>Medical Maintenance Companies | شركات صيانة الأجهزة الطبية</strong>
       <p className="muted">{companyCount?`${companyCount} linked`:'لا توجد شركات صيانة طبية مرتبطة'}</p>
      </div>
     </div>

     {linkedMedical.length>0&&<div style={{display:'grid',gap:8}}>
      {linkedMedical.map(x=><div key={x.id} className="facility-panel" style={{margin:0,padding:12}}>
       <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <div>
         <strong>{x.company.name_ar||x.company.name_en||x.company.code}</strong>
         <div className="muted">{x.company.name_en&&x.company.name_ar?`${x.company.name_en} · `:''}{x.company.code}</div>
        </div>
        <span className="badge">{x.relationship_role||'medical_maintenance_provider'}</span>
       </div>
       <div className="form-grid" style={{marginTop:8}}>
        <div><b>Project | المشروع</b><p>{x.project?.name||x.project?.project_code||'—'}</p></div>
        <div><b>Site | الموقع</b><p>{x.site?.name||'All / جميع المواقع'}</p></div>
        <div><b>Manufacturer | المصنع</b><p>{x.manufacturer_id||'All / جميع المصنعين'}</p></div>
        <div><b>Equipment Category | فئة الجهاز</b><p>{x.asset_type_id||'All / جميع الفئات'}</p></div>
        {x.contract_reference&&<div><b>Contract Ref. | مرجع العقد</b><p>{x.contract_reference}</p></div>}
       </div>
      </div>)}
     </div>}
    </div>
   </article>
  })}</div>
 </section>
}
