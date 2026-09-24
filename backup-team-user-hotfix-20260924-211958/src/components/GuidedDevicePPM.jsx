import {useMemo,useState} from 'react'
import {Link} from 'react-router-dom'

const frequencyOrder={daily:0,weekly:1,monthly:2,quarterly:3,semiannual:4,annual:5}
const closed=['completed','approved','closed','cancelled']

export default function GuidedDevicePPM({data,lang}){
 const [query,setQuery]=useState('')
 const [assetId,setAssetId]=useState('')
 const [frequency,setFrequency]=useState('')
 const assets=useMemo(()=>[...(data?.assets||[])].filter(x=>x.status==='active').sort((a,b)=>String(a.asset_tag||'').localeCompare(String(b.asset_tag||''))),[data])
 const visibleAssets=useMemo(()=>{
  const q=query.trim().toLowerCase()
  if(!q)return assets
  return assets.filter(x=>[x.asset_tag,x.name_ar,x.name_en,x.manufacturer,x.model].some(v=>String(v||'').toLowerCase().includes(q)))
 },[assets,query])
 const asset=assets.find(x=>x.id===assetId)

 const procedures=useMemo(()=>{
  if(!asset)return []
  return (data?.procedures||[]).filter(x=>
   x.status==='approved'&&
   x.organization_id===asset.organization_id&&
   (!x.category_id||x.category_id===asset.category_id)&&
   (!x.manufacturer||x.manufacturer.toLowerCase()===(asset.manufacturer||'').toLowerCase())&&
   (!x.model||x.model.toLowerCase()===(asset.model||'').toLowerCase())&&
   (!frequency||x.frequency===frequency)
  ).sort((a,b)=>(frequencyOrder[a.frequency]??99)-(frequencyOrder[b.frequency]??99))
 },[data,asset,frequency])

 const name=x=>lang==='ar'?x?.name_ar||x?.name_en:x?.name_en||x?.name_ar
 const frequencyLabel=f=>({daily:'Daily | يومي',weekly:'Weekly | أسبوعي',monthly:'Monthly | شهري',quarterly:'Quarterly | ربع سنوي',semiannual:'Semiannual | نصف سنوي',annual:'Annual | سنوي'})[f]||f
 const stepsFor=p=>(data?.steps||[]).filter(s=>s.procedure_id===p.id).sort((a,b)=>a.seq-b.seq)
 const planFor=p=>(data?.plans||[]).find(x=>x.asset_id===asset?.id&&x.procedure_id===p.id&&['active','draft','paused'].includes(x.status))
 const jobsFor=p=>{
  const plan=planFor(p)
  if(!plan)return []
  return (data?.jobs||[]).filter(j=>j.plan_id===plan.id).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')))
 }
 const currentJob=p=>jobsFor(p).find(j=>!closed.includes(j.status))||jobsFor(p).at(-1)

 return <div className="facility-panel">
  <div className="page-head"><div><h2>Device Guided PPM | الصيانة الوقائية الموجهة للجهاز</h2><p className="muted">Choose a medical device to see its approved PM procedures in execution order. | اختر الجهاز لعرض إجراءات الصيانة المعتمدة بالترتيب.</p></div></div>
  <div className="filter-grid">
   <label>Search Device | بحث الجهاز<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Asset tag, device name, manufacturer, model"/></label>
   <label>Frequency | التكرار<select value={frequency} onChange={e=>setFrequency(e.target.value)}>
    <option value="">All | الكل</option>
    {['daily','weekly','monthly','quarterly','semiannual','annual'].map(x=><option key={x} value={x}>{frequencyLabel(x)}</option>)}
   </select></label>
  </div>
  <div className="security-check-list" style={{marginTop:12}}>
   {visibleAssets.slice(0,100).map(a=><button type="button" key={a.id} className={'security-check-card '+(assetId===a.id?'active':'')} style={{textAlign:'start',cursor:'pointer'}} onClick={()=>setAssetId(a.id)}>
    <div><strong>{a.asset_tag||'—'} — {name(a)||'Medical Equipment'}</strong><p>{[a.manufacturer,a.model].filter(Boolean).join(' · ')||'—'}</p></div>
   </button>)}
  </div>

  {asset&&<div style={{marginTop:18}}>
   <h3>{asset.asset_tag} — {name(asset)}</h3>
   {!procedures.length?<div className="facility-panel"><strong>No approved procedure matched this device. | لا يوجد إجراء PPM معتمد مطابق لهذا الجهاز.</strong><p className="muted">Create/approve a procedure for its category, manufacturer/model, then link it through a PPM plan.</p></div>:
   procedures.map(p=>{
    const steps=stepsFor(p),plan=planFor(p),job=currentJob(p)
    return <div className="facility-panel" key={p.id} style={{marginBlock:12}}>
     <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
      <div><strong>{p.code} — {name(p)}</strong><p className="muted">{frequencyLabel(p.frequency)} · {steps.length} Steps | خطوات · {p.estimated_minutes||'—'} min</p></div>
      <div className="row-actions">
       <Link className="btn secondary" to={'/ppm/procedure/'+p.id}>Procedure | الإجراء</Link>
       {job&&<Link className="btn primary" to={'/ppm/job/'+job.id}>{job.status==='in_progress'?'Continue Guided PM | متابعة':'Open PM Job | فتح المهمة'}</Link>}
      </div>
     </div>
     <ol style={{marginTop:12,paddingInlineStart:22}}>
      {steps.map(s=><li key={s.id} style={{marginBottom:8}}><strong>{name({name_ar:s.title_ar,name_en:s.title_en})}</strong>{(lang==='ar'?s.instructions_ar:s.instructions_en)&&<div className="muted">{lang==='ar'?s.instructions_ar:s.instructions_en}</div>}</li>)}
     </ol>
     {!plan&&<p className="muted">No PPM plan linked yet | لا توجد خطة PPM مرتبطة بهذا الجهاز بعد.</p>}
     {plan&&!job&&<p className="muted">Plan exists but no generated job is available yet | الخطة موجودة ولكن لا توجد مهمة مولدة بعد.</p>}
    </div>
   })}
  </div>}
 </div>
}
