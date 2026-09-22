import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadMasterAssetLibrary,adoptMasterTemplates} from '../lib/masterAssetLibrary'
import {Field,Notice} from '../components/FacilityFields'

export default function MasterAssetLibrary(){
 const {can,access}=useAuth(),{lang}=useLanguage()
 const [data,setData]=useState(null),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const [system,setSystem]=useState(''),[type,setType]=useState(''),[manufacturer,setManufacturer]=useState(''),[org,setOrg]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false)
 const load=async()=>{try{setError('');setData(await loadMasterAssetLibrary())}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[])
 const systems=useMemo(()=>[...new Set((data?.types||[]).map(x=>x.system_code))].sort(),[data])
 const rows=useMemo(()=>{if(!data)return[];return data.types.filter(t=>(!system||t.system_code===system)&&(!type||t.id===type)&&(!query||[t.code,t.name_ar,t.name_en,t.system_code].join(' ').toLowerCase().includes(query.toLowerCase()))).map(t=>({
  ...t,
  options:data.options.filter(o=>o.asset_type_id===t.id).map(o=>({...o,manufacturer:data.manufacturers.find(m=>m.id===o.manufacturer_id)})),
  templates:data.templates.filter(p=>p.asset_type_id===t.id)
 }))},[data,system,type,query])
 const allowedOrgs=useMemo(()=>{if(!data)return[];if(access?.super_admin)return data.organizations;const ids=new Set((access?.roles||[]).filter(r=>r.permission==='assets.manage').map(r=>r.organization_id));return data.organizations.filter(o=>ids.has(o.id))},[data,access])
 const adopt=async t=>{if(!org)return setError(lang==='ar'?'اختر المنظمة أولاً':'Select organization first');try{setBusy(true);setError('');const r=await adoptMasterTemplates(org,t.id,manufacturer||null);setSuccess(lang==='ar'?`تم تجهيز ${t.name_ar} للمنظمة وإنشاء ${r?.procedures_created||0} برنامج صيانة.`:`${t.name_en} prepared; ${r?.procedures_created||0} maintenance procedures created.`)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section className="facility-module">
  <div className="page-head"><div><h1>{lang==='ar'?'مكتبة الأصول والصيانة':'Asset & Maintenance Library'}</h1><p>{lang==='ar'?'أصول شائعة للمرافق العامة مع المصنعين وقوالب الصيانة الدورية الجاهزة.':'Common facility assets with manufacturers and ready PPM templates.'}</p></div></div>
  <Notice error={error} success={success}/>
  {data&&<>
   <div className="stats-grid facility-stats"><div className="stat-card"><span>{lang==='ar'?'أنواع الأصول':'Asset types'}</span><strong>{data.types.length}</strong></div><div className="stat-card"><span>{lang==='ar'?'المصنعون':'Manufacturers'}</span><strong>{data.manufacturers.length}</strong></div><div className="stat-card"><span>{lang==='ar'?'قوالب الصيانة':'PPM templates'}</span><strong>{data.templates.length}</strong></div></div>
   <div className="facility-panel filter-grid">
    <Field label={lang==='ar'?'النظام':'System'}><select value={system} onChange={e=>{setSystem(e.target.value);setType('')}}><option value="">{lang==='ar'?'الكل':'All'}</option>{systems.map(x=><option key={x}>{x}</option>)}</select></Field>
    <Field label={lang==='ar'?'نوع الأصل':'Asset type'}><select value={type} onChange={e=>setType(e.target.value)}><option value="">{lang==='ar'?'الكل':'All'}</option>{data.types.filter(x=>!system||x.system_code===system).map(x=><option value={x.id} key={x.id}>{lang==='ar'?x.name_ar:x.name_en}</option>)}</select></Field>
    <Field label={lang==='ar'?'المصنع':'Manufacturer'}><select value={manufacturer} onChange={e=>setManufacturer(e.target.value)}><option value="">{lang==='ar'?'عام / أي مصنع':'Generic / any'}</option>{data.manufacturers.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></Field>
    <Field label={lang==='ar'?'المنظمة':'Organization'}><select value={org} onChange={e=>setOrg(e.target.value)}><option value="">{lang==='ar'?'اختر':'Select'}</option>{allowedOrgs.map(x=><option value={x.id} key={x.id}>{x.name_ar||x.name_en||x.name||x.code}</option>)}</select></Field>
    <Field label={lang==='ar'?'بحث':'Search'}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Zamil / FM-200 / Chiller / BMS..."/></Field>
   </div>
   <div style={{display:'grid',gap:12}}>{rows.map(t=><article className="facility-panel" key={t.id}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}><div><div style={{fontSize:11,color:'#607087',fontWeight:800}}>{t.system_code} · {t.code}</div><h3 style={{margin:'4px 0',color:'#0b2b4b'}}>{lang==='ar'?t.name_ar:t.name_en}</h3><div style={{fontSize:11}}>{lang==='ar'?'الأهمية الافتراضية':'Default criticality'}: <b>{t.default_criticality}</b>{t.expected_life_years?` · ${lang==='ar'?'عمر متوقع':'Life'} ${t.expected_life_years} ${lang==='ar'?'سنة':'yr'}`:''}</div></div>{can('assets.manage',org||null)&&<button className="btn primary" disabled={busy||!org} onClick={()=>adopt(t)}>{lang==='ar'?'اعتماد للمنظمة':'Adopt for organization'}</button>}</div>
    <div style={{marginTop:10,fontSize:11}}><b>{lang==='ar'?'المصنعون/العائلات':'Manufacturers / families'}:</b> {t.options.length?t.options.map(o=>`${o.manufacturer?.name||''}${o.model_family?` — ${o.model_family}`:''}`).join(' | '):(lang==='ar'?'قالب عام':'Generic')}</div>
    <div style={{marginTop:8,fontSize:11}}><b>{lang==='ar'?'برامج الصيانة':'Maintenance'}:</b> {t.templates.length?t.templates.map(p=>`${lang==='ar'?p.title_ar:p.title_en} (${p.frequency})`).join(' | '):(lang==='ar'?'سيتم استكمال القالب':'Template to be expanded')}</div>
   </article>)}</div>
  </>}
 </section>
}
