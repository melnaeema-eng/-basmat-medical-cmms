import {useEffect,useMemo,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'

const fmt=v=>v?new Date(v).toLocaleDateString(): '—'
const money=v=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2})
const statusClass=s=>{
 const x=String(s||'').toLowerCase()
 if(['closed','completed','complete','active','in_service','good','excellent'].includes(x))return 'ok'
 if(['overdue','failed','poor','out_of_service','critical'].includes(x))return 'bad'
 return 'mid'
}
async function safeOne(table,id){
 if(!id)return null
 const {data,error}=await supabase.from(table).select('*').eq('id',id).maybeSingle()
 if(error)return null
 return data||null
}
async function safeMany(table,assetId,orderCol='created_at'){
 const q=supabase.from(table).select('*').eq('asset_id',assetId)
 const {data,error}=orderCol?await q.order(orderCol,{ascending:false}).limit(50):await q.limit(50)
 if(error)return[]
 return data||[]
}

export default function AssetPassport(){
 const {id}=useParams()
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const [asset,setAsset]=useState(null)
 const [related,setRelated]=useState({})
 const [assets,setAssets]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')

 useEffect(()=>{
  let alive=true
  ;(async()=>{
   try{
    setLoading(true);setError('')
    if(!id){
     const {data,error}=await supabase.from('bf_assets')
      .select('id,asset_tag,name_ar,name_en,manufacturer,model,status,operational_status,criticality')
      .order('asset_tag').limit(500)
     if(error)throw error
     if(alive)setAssets(data||[])
     return
    }
    const {data:a,error:e}=await supabase.from('bf_assets').select('*').eq('id',id).single()
    if(e)throw e
    const [org,client,site,category,building,floor,zone,room,wo,ppm,inspections,warranty]=await Promise.all([
     safeOne('bf_organizations',a.organization_id),
     safeOne('bf_clients',a.client_id),
     safeOne('bf_sites',a.site_id),
     safeOne('bf_asset_categories',a.category_id),
     safeOne('bf_buildings',a.building_id),
     safeOne('bf_floors',a.floor_id),
     safeOne('bf_zones',a.zone_id),
     safeOne('bf_rooms',a.room_id),
     safeMany('bf_work_orders',a.id),
     safeMany('bf_ppm_jobs',a.id,'due_date'),
     safeMany('bf14_asset_inspections',a.id,'inspected_at'),
     safeMany('bf14_warranty_claims',a.id,'created_at')
    ])
    if(alive){setAsset(a);setRelated({org,client,site,category,building,floor,zone,room,wo,ppm,inspections,warranty})}
   }catch(ex){if(alive)setError(ex.message||String(ex))}
   finally{if(alive)setLoading(false)}
  })()
  return()=>{alive=false}
 },[id])

 const location=useMemo(()=>{
  if(!asset)return '—'
  const vals=[
   related.site?.name||related.site?.name_en||related.site?.name_ar,
   related.building?.name||related.building?.name_en||related.building?.name_ar,
   related.floor?.name||related.floor?.name_en||related.floor?.name_ar,
   related.zone?.name||related.zone?.name_en||related.zone?.name_ar,
   related.room?.name||related.room?.name_en||related.room?.name_ar
  ].filter(Boolean)
  return vals.length?vals.join(' / '):(asset.location_node_id||'—')
 },[asset,related])

 if(loading)return <section className="facility-module"><div className="facility-panel">{ar?'جاري التحميل...':'Loading...'}</div></section>
 if(error)return <section className="facility-module"><div className="facility-panel" style={{color:'#b42318'}}>{error}</div></section>

 if(!id)return <section className="facility-module">
  <div className="page-head"><div><h1>{ar?'جوازات الأجهزة الطبية':'Medical Device Passports'}</h1><p>{ar?'اختر جهازاً طبياً لفتح جوازه التشغيلي والصياني الكامل.':'Select a medical device to open its operational and maintenance passport.'}</p></div></div>
  <div className="facility-panel" style={{overflowX:'auto'}}>
   <table style={{width:'100%',borderCollapse:'collapse'}}>
    <thead><tr><th>{ar?'رقم الجهاز':'Device tag'}</th><th>{ar?'الاسم':'Name'}</th><th>{ar?'الشركة':'Manufacturer'}</th><th>{ar?'الموديل':'Model'}</th><th>{ar?'الحالة':'Status'}</th><th/></tr></thead>
    <tbody>{assets.map(x=><tr key={x.id} style={{borderTop:'1px solid #e7edf3'}}>
     <td>{x.asset_tag}</td><td>{ar?x.name_ar:x.name_en}</td><td>{x.manufacturer||'—'}</td><td>{x.model||'—'}</td><td>{x.operational_status||x.status}</td>
     <td><Link className="btn primary" to={`/asset-passport/${x.id}`}>{ar?'فتح جواز الجهاز':'Open device passport'}</Link></td>
    </tr>)}</tbody>
   </table>
  </div>
 </section>

 const wo=related.wo||[], ppm=related.ppm||[], inspections=related.inspections||[], warranty=related.warranty||[]
 const qrData=encodeURIComponent(`${window.location.origin}/asset-passport/${asset.id}`)
 return <section className="facility-module asset-passport">
  <style>{`
   .passport-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
   .passport-kpi{border:1px solid #e4eaf0;border-radius:14px;padding:12px;background:#fff}
   .passport-kpi span{display:block;font-size:11px;color:#64748b}.passport-kpi b{display:block;margin-top:4px;color:#0b2b4b}
   .passport-status{display:inline-block;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:800}
   .passport-status.ok{background:#ecfdf3;color:#067647}.passport-status.mid{background:#fffaeb;color:#b54708}.passport-status.bad{background:#fef3f2;color:#b42318}
   .passport-table{width:100%;border-collapse:collapse}.passport-table th,.passport-table td{padding:8px;border-bottom:1px solid #edf1f5;text-align:start;font-size:11px}
   @media print{.app-sidebar,.bafm-topbar,.no-print,button{display:none!important}.bafm-main,.bafm-content{margin:0!important;padding:0!important}}
  `}</style>

  <div className="page-head">
   <div>
    <h1>{ar?'جواز الجهاز الطبي':'Medical Device Passport'} — {asset.asset_tag}</h1>
    <p>{ar?asset.name_ar:asset.name_en}</p>
   </div>
   <div className="no-print" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <Link className="btn" to="/asset-passport">{ar?'كل الجوازات':'All passports'}</Link>
    <Link className="btn" to={`/assets/${asset.id}`}>{ar?'سجل الجهاز':'Device record'}</Link>
    <button className="btn" onClick={()=>window.print()}>{ar?'طباعة / PDF':'Print / PDF'}</button>
   </div>
  </div>

  <div className="facility-panel" style={{display:'grid',gridTemplateColumns:'1fr auto',gap:18,alignItems:'start'}}>
   <div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
     <span className={'passport-status '+statusClass(asset.operational_status)}>{asset.operational_status}</span>
     <span className={'passport-status '+statusClass(asset.condition)}>{asset.condition}</span>
     <span className={'passport-status '+statusClass(asset.criticality)}>{asset.criticality}</span>
    </div>
    <div className="passport-grid">
     <Info l={ar?'الشركة المصنعة':'Manufacturer'} v={asset.manufacturer}/>
     <Info l={ar?'الموديل':'Model'} v={asset.model}/>
     <Info l={ar?'الرقم التسلسلي':'Serial number'} v={asset.serial_number}/>
     <Info l={ar?'السعة':'Capacity'} v={[asset.capacity,asset.unit].filter(Boolean).join(' ')}/>
     <Info l={ar?'التصنيف':'Category'} v={related.category?.name_ar||related.category?.name_en||related.category?.code}/>
     <Info l={ar?'الموقع':'Location'} v={location}/>
    </div>
   </div>
   <div style={{textAlign:'center'}}>
    <img alt="Asset QR" width="150" height="150" src={`https://quickchart.io/qr?size=150&text=${qrData}`}/>
    <div style={{fontSize:10,marginTop:4}}>{asset.asset_tag}</div>
   </div>
  </div>

  <h2>{ar?'التركيب والتشغيل والضمان':'Installation, Commissioning & Warranty'}</h2>
  <div className="passport-grid">
   <Info l={ar?'تاريخ التركيب':'Installation'} v={fmt(asset.installation_date)}/>
   <Info l={ar?'التشغيل':'Commissioning'} v={fmt(asset.commissioning_date)}/>
   <Info l={ar?'تاريخ الشراء':'Purchase date'} v={fmt(asset.purchase_date)}/>
   <Info l={ar?'بداية الضمان':'Warranty start'} v={fmt(asset.warranty_start)}/>
   <Info l={ar?'نهاية الضمان':'Warranty end'} v={fmt(asset.warranty_end)}/>
   <Info l={ar?'مزود الضمان':'Warranty provider'} v={asset.warranty_provider}/>
   <Info l={ar?'تكلفة الشراء':'Purchase cost'} v={money(asset.purchase_cost)}/>
   <Info l={ar?'تكلفة الاستبدال':'Replacement cost'} v={money(asset.replacement_cost)}/>
   <Info l={ar?'العمر المتوقع':'Expected life'} v={asset.expected_life_years?`${asset.expected_life_years} ${ar?'سنة':'years'}`:'—'}/>
  </div>

  <h2>{ar?'الصيانة الوقائية للأجهزة الطبية / PPM':'Medical Device Preventive Maintenance / PPM'}</h2>
  <Table rows={ppm} columns={[
   ['job_number',ar?'رقم المهمة':'Job'],['due_date',ar?'الاستحقاق':'Due'],['status',ar?'الحالة':'Status']
  ]} link={r=>r.id?`/ppm/job/${r.id}`:null}/>

  <h2>{ar?'أوامر العمل':'Work Orders'}</h2>
  <Table rows={wo} columns={[
   ['work_order_number',ar?'رقم الأمر':'WO'],['title',ar?'العنوان':'Title'],['priority',ar?'الأولوية':'Priority'],['status',ar?'الحالة':'Status']
  ]}/>

  <h2>{ar?'الفحوصات والحالة ودورة الحياة':'Inspections, Condition & Lifecycle'}</h2>
  <Table rows={inspections} columns={[
   ['inspected_at',ar?'تاريخ الفحص':'Inspection'],['condition',ar?'الحالة':'Condition'],['operational_status',ar?'التشغيل':'Operational'],['score',ar?'النتيجة':'Score'],['notes',ar?'ملاحظات':'Notes']
  ]}/>

  <h2>{ar?'مطالبات الضمان':'Warranty Claims'}</h2>
  <Table rows={warranty} columns={[
   ['claim_number',ar?'رقم المطالبة':'Claim'],['provider',ar?'المزود':'Provider'],['status',ar?'الحالة':'Status'],['issue',ar?'المشكلة':'Issue']
  ]}/>

  <h2>{ar?'الصور والمستندات الفنية':'Technical Photos & Documents'}</h2>
  <div className="facility-panel">
   <p style={{marginTop:0}}>{ar?'استخدم مركز المستندات لرفع وربط الصور والملفات الخاصة بالأصل.':'Use Document Control to upload and manage asset photos and documents.'}</p>
   <div className="no-print" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <Link className="btn" to="/documents">{ar?'المستندات':'Documents'}</Link>
    <Link className="btn" to="/document-control">{ar?'ضبط المستندات':'Document Control'}</Link>
   </div>
  </div>

  {(asset.description||asset.notes)&&<div className="facility-panel">
   {asset.description&&<p><b>{ar?'الوصف':'Description'}:</b> {asset.description}</p>}
   {asset.notes&&<p><b>{ar?'ملاحظات':'Notes'}:</b> {asset.notes}</p>}
  </div>}
 </section>
}
function Info({l,v}){return <div className="passport-kpi"><span>{l}</span><b>{v||'—'}</b></div>}
function Table({rows,columns,link}){
 return <div className="facility-panel" style={{overflowX:'auto'}}>
  <table className="passport-table"><thead><tr>{columns.map(c=><th key={c[0]}>{c[1]}</th>)}{link&&<th/>}</tr></thead>
   <tbody>{rows.length?rows.map((r,i)=><tr key={r.id||i}>{columns.map(c=><td key={c[0]}>{c[0].includes('date')||c[0].includes('_at')?fmt(r[c[0]]):(r[c[0]]??'—')}</td>)}{link&&<td>{link(r)&&<Link className="btn" to={link(r)}>Open</Link>}</td>}</tr>):<tr><td colSpan={columns.length+(link?1:0)}>—</td></tr>}</tbody>
  </table>
 </div>
}
