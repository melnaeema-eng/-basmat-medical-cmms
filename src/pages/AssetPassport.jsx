import {useEffect,useMemo,useState} from 'react'
import {Link,useParams,useSearchParams} from 'react-router-dom'
import QRCode from 'qrcode'
import {supabase} from '../lib/supabaseClient'
import {PUBLIC_ASSET_COLUMNS} from '../lib/facility'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadPassportLocation,passportLocationFields} from '../lib/passportLocation'

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
 const [params]=useSearchParams()
 const tagView=params.get('view')==='tag'
 const {lang}=useLanguage()
 const {can}=useAuth()
 const ar=lang==='ar'
 const [asset,setAsset]=useState(null)
 const [related,setRelated]=useState({})
 const [assets,setAssets]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [qr,setQr]=useState('')
 const [qrError,setQrError]=useState(false)
 const [cost,setCost]=useState(null)

 useEffect(()=>{
  let alive=true
  setQr('');setQrError(false)
  if(id)QRCode.toDataURL(`${window.location.origin}/asset-passport/${id}`,{width:600,margin:4,errorCorrectionLevel:'M'})
   .then(value=>{if(alive)setQr(value)})
   .catch(()=>{if(alive)setQrError(true)})
  return()=>{alive=false}
 },[id])

 useEffect(()=>{
  let alive=true
  ;(async()=>{
   try{
    setLoading(true);setError('');setCost(null)
    if(!id){
     const {data,error}=await supabase.from('bf_assets')
      .select('id,asset_tag,name_ar,name_en,manufacturer,model,status,operational_status,criticality')
      .order('asset_tag').limit(500)
     if(error)throw error
     if(alive)setAssets(data||[])
     return
    }
    const {data:a,error:e}=await supabase.from('bf_assets').select(PUBLIC_ASSET_COLUMNS).eq('id',id).single()
    if(e)throw e
    if(can('assets.manage',a.organization_id)){
     const c=await supabase.rpc('bf3_asset_cost',{p_id:id})
     if(alive&&!c.error)setCost(c.data)
    }
    const [org,client,locationRecords,category,wo,ppm,inspections,warranty]=await Promise.all([
     safeOne('bf_organizations',a.organization_id),
     safeOne('bf_clients',a.client_id),
     loadPassportLocation(a,safeOne),
     safeOne('bf_asset_categories',a.category_id),
     safeMany('bf_work_orders',a.id),
     safeMany('bf_ppm_jobs',a.id,'due_date'),
     safeMany('bf14_asset_inspections',a.id,'inspected_at'),
     safeMany('bf14_warranty_claims',a.id,'created_at')
    ])
    if(alive){setAsset(a);setRelated({org,client,...locationRecords,category,wo,ppm,inspections,warranty})}
   }catch(ex){if(alive)setError(ex.message||String(ex))}
   finally{if(alive)setLoading(false)}
  })()
  return()=>{alive=false}
 },[id])

 const location=useMemo(()=>{
  if(!asset)return '—'
  const vals=passportLocationFields(related,lang).map(field=>field.value).filter(Boolean)
  return vals.length?vals.join(' / '):'—'
 },[asset,related,lang])

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
 const deviceName=(ar?asset.name_ar:asset.name_en)||asset.name_en||asset.name_ar||asset.asset_tag
 const qrImage=qr?<img alt={ar?'رمز QR لجواز الجهاز':'Device passport QR code'} width="150" height="150" src={qr}/>:<p role="status">{qrError?(ar?'تعذر إنشاء QR؛ أعد تحميل الصفحة.':'Could not generate QR. Reload the page.'):(ar?'جارٍ تجهيز QR…':'Preparing QR…')}</p>
 if(tagView)return <section className="facility-module">
  <style>{`
   .device-tag{box-sizing:border-box;width:90mm;min-height:60mm;padding:4mm;border:1px solid #17324d;border-radius:3mm;background:#fff;color:#10273f;display:grid;grid-template-columns:minmax(0,1fr) 29mm;gap:3mm;align-items:center;font-family:Arial,sans-serif}
   .device-tag h2{font-size:20px;margin:4px 0}.device-tag p{margin:4px 0;font-size:11px;overflow-wrap:anywhere}.device-tag img{display:block;width:29mm;height:29mm}.device-tag .device-tag-brand{grid-column:1/-1;font-size:11px;font-weight:700;border-bottom:2px solid #f28c28;padding-bottom:2mm}
   @media screen and (max-width:450px){.device-tag{width:100%;grid-template-columns:minmax(0,1fr) 29mm}}
   @media print{
    @page{size:90mm 60mm;margin:0}
    html:has(.device-tag),body:has(.device-tag){width:90mm!important;height:60mm!important;min-height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff!important}
    body:has(.device-tag) *{visibility:visible!important}
    body:has(.device-tag) *:not(:has(.device-tag)):not(.device-tag):not(.device-tag *){display:none!important}
    body:has(.device-tag) *:has(.device-tag){display:block!important;position:static!important;width:90mm!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;overflow:visible!important;transform:none!important;box-shadow:none!important;border:0!important}
    body:has(.device-tag)::before,body:has(.device-tag)::after,body:has(.device-tag) *:has(.device-tag)::before,body:has(.device-tag) *:has(.device-tag)::after{display:none!important;content:none!important}
    .device-tag{position:static!important;inset:auto!important;display:grid!important;width:90mm!important;height:60mm!important;min-height:0!important;margin:0!important;box-shadow:none!important;border:0!important;border-radius:0!important;break-inside:avoid;page-break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}
   }
  `}</style>
  <div className="page-head no-print"><div><h1>{ar?'تاق الجهاز':'Device tag'} — {asset.asset_tag}</h1><p>{ar?'ملصق 90 × 60 مم. رمز QR يفتح جواز الجهاز بعد تسجيل الدخول.':'90 × 60 mm label. Scan QR to open the device passport after signing in.'}</p></div><div className="row-actions">
   <Link className="btn" to="/medical-asset-cockpit">{ar?'الأجهزة والصيانة':'Devices and maintenance'}</Link>
   <Link className="btn" to={`/asset-passport/${asset.id}`}>{ar?'جواز الجهاز':'Device passport'}</Link>
   <button className="btn primary" disabled={!qr} onClick={()=>window.print()}>{ar?'طباعة التاق / PDF':'Print tag / PDF'}</button>
  </div></div>
  <div className="device-tag" dir={ar?'rtl':'ltr'}>
   <div className="device-tag-brand">{(ar?related.org?.name_ar:related.org?.name_en)||related.org?.name||'Basmat Alnawabigh'} · {ar?'جهاز طبي':'Medical device'}</div>
   <div><h2 dir="ltr">{asset.asset_tag}</h2><p><strong>{deviceName}</strong></p><p>{asset.manufacturer} {asset.exact_model||asset.model}</p><p>{ar?'السيريال':'Serial'}: <b dir="ltr">{asset.serial_number||'—'}</b></p><p>{(ar?related.site?.name_ar:related.site?.name_en)||related.site?.name||''}</p></div>
   <div>{qrImage}<p style={{textAlign:'center',fontSize:10}}>{ar?'امسح لفتح الجواز':'Scan for passport'}</p></div>
  </div>
 </section>
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
    <Link className="btn primary" to={`/asset-passport/${asset.id}?view=tag`}>{ar?'طباعة التاق وQR':'Print device tag and QR'}</Link>
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
     <Info l={ar?'شركة الصيانة':'Service provider'} v={(ar?related.org?.name_ar:related.org?.name_en)||related.org?.name}/>
     <Info l={ar?'المالك':'Owner'} v={(ar?related.client?.name_ar:related.client?.name_en)||related.client?.name}/>
     <Info l={ar?'الشركة المصنعة':'Manufacturer'} v={asset.manufacturer}/>
     <Info l={ar?'الموديل':'Model'} v={asset.model}/>
     <Info l={ar?'الرقم التسلسلي':'Serial number'} v={asset.serial_number}/>
     <Info l={ar?'السعة':'Capacity'} v={[asset.capacity,asset.unit].filter(Boolean).join(' ')}/>
     <Info l={ar?'التصنيف':'Category'} v={related.category?.name_ar||related.category?.name_en||related.category?.code}/>
    </div>
   </div>
   <div style={{textAlign:'center'}}>
    {qrImage}
    <div style={{fontSize:10,marginTop:4}}>{asset.asset_tag}</div>
   </div>
  </div>

  <div className="facility-panel" style={{marginTop:16,borderInlineStart:'4px solid #96c975'}}>
   <h2 style={{marginTop:0}}>{ar?'موقع الجهاز بالتفصيل':'Device location'}</h2>
   <p style={{color:'#52677b'}}>{location}</p>
   <div className="passport-grid">{passportLocationFields(related,lang).map(field=><Info key={field.key} l={field.label} v={field.value||(ar?'غير محدد':'Not specified')}/>)}</div>
   {passportLocationFields(related,lang).some(field=>field.missing)&&<p role="status">{ar?'بعض تفاصيل الموقع غير مسجلة أو غير متاحة للعرض.':'Some location details are not recorded or are unavailable.'}</p>}
   {can('assets.manage',asset.organization_id)&&<Link className="btn no-print" style={{marginTop:12}} to={`/assets/${asset.id}`}>{ar?'استكمال / تعديل موقع الجهاز':'Complete / edit device location'}</Link>}
  </div>

  <h2>{ar?'التركيب والتشغيل والضمان':'Installation, Commissioning & Warranty'}</h2>
  <div className="passport-grid">
   <Info l={ar?'تاريخ التركيب':'Installation'} v={fmt(asset.installation_date)}/>
   <Info l={ar?'التشغيل':'Commissioning'} v={fmt(asset.commissioning_date)}/>
   <Info l={ar?'تاريخ الشراء':'Purchase date'} v={fmt(asset.purchase_date)}/>
   <Info l={ar?'بداية الضمان':'Warranty start'} v={fmt(asset.warranty_start)}/>
   <Info l={ar?'نهاية الضمان':'Warranty end'} v={fmt(asset.warranty_end)}/>
   <Info l={ar?'مزود الضمان':'Warranty provider'} v={asset.warranty_provider}/>
   {can('assets.manage',asset.organization_id)&&<Info l={ar?'تكلفة الشراء':'Purchase cost'} v={money(cost?.purchase_cost)}/>}
   {can('assets.manage',asset.organization_id)&&<Info l={ar?'تكلفة الاستبدال':'Replacement cost'} v={money(cost?.replacement_cost)}/>}
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
