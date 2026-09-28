import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {BrowserQRCodeReader} from '@zxing/browser'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'
import {useAuth} from '../context/AuthContext'

const inactive=new Set(['closed','completed','cancelled','canceled','archived'])

function candidateFrom(raw){
 const value=(raw||'').trim()
 if(!value)return ''
 try{
  const u=new URL(value)
  const parts=u.pathname.split('/').filter(Boolean)
  return parts.at(-1)||value
 }catch{return value}
}

export default function QrAssetScanner(){
 const {lang}=useLanguage()
 const {can}=useAuth()
 const ar=lang==='ar'
 const navigate=useNavigate()
 const videoRef=useRef(null)
 const controlsRef=useRef(null)
 const lockedRef=useRef(false)
 const [open,setOpen]=useState(false)
 const [query,setQuery]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [asset,setAsset]=useState(null)
 const [orders,setOrders]=useState([])

 const stop=()=>{
  try{controlsRef.current?.stop?.()}catch{}
  controlsRef.current=null
  if(videoRef.current?.srcObject){
   try{videoRef.current.srcObject.getTracks().forEach(t=>t.stop())}catch{}
   videoRef.current.srcObject=null
  }
  setOpen(false)
  lockedRef.current=false
 }

 useEffect(()=>()=>stop(),[])

 const resolve=async raw=>{
  const value=candidateFrom(raw)
  if(!value)return
  setBusy(true);setError('');setAsset(null);setOrders([])
  try{
   let found=null
   const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
   if(uuid){
    const r=await supabase.from('bf_assets')
     .select('id,organization_id,client_id,site_id,asset_tag,serial_number,name_ar,name_en,status,operational_status')
     .eq('id',value).limit(1)
    if(r.error)throw r.error
    found=r.data?.[0]||null
   }
   if(!found){
    const safe=value.replaceAll(',',' ')
    const r=await supabase.from('bf_assets')
     .select('id,organization_id,client_id,site_id,asset_tag,serial_number,name_ar,name_en,status,operational_status')
     .or(`asset_tag.ilike.%${safe}%,serial_number.ilike.%${safe}%,name_ar.ilike.%${safe}%,name_en.ilike.%${safe}%`)
     .limit(5)
    if(r.error)throw r.error
    if(!r.data?.length)throw Error(ar?'لم يتم العثور على الجهاز الطبي أو لا تملك صلاحية الوصول إليه':'Asset/device not found or you do not have access')
    found=r.data[0]
   }

   const w=await supabase.from('bf_work_orders')
    .select('id,work_order_number,title,status,priority,created_at')
    .eq('asset_id',found.id).order('created_at',{ascending:false}).limit(20)
   if(w.error)throw w.error
   const active=(w.data||[]).filter(x=>!inactive.has(String(x.status||'').toLowerCase()))
   setAsset(found);setOrders(active)
   stop()

   if(active.length===1){
    navigate('/corrective/work_order/'+active[0].id)
    return
   }
   if(active.length===0&&can('assets.view',found.organization_id,found.client_id,{site_id:found.site_id})){
    navigate('/asset-passport/'+found.id)
    return
   }
  }catch(e){
   lockedRef.current=false
   setError(e.message||String(e))
  }finally{setBusy(false)}
 }

 const start=async()=>{
  setError('');setAsset(null);setOrders([])
  if(!navigator.mediaDevices?.getUserMedia){
   setError(ar?'الكاميرا غير مدعومة في هذا المتصفح':'Camera is not supported in this browser')
   return
  }
  try{
   setOpen(true)
   await new Promise(r=>setTimeout(r,0))
   const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:250})
   controlsRef.current=await reader.decodeFromConstraints(
    {video:{facingMode:{ideal:'environment'}}},
    videoRef.current,
    result=>{
     if(!result?.getText?.()||lockedRef.current)return
     lockedRef.current=true
     resolve(result.getText())
    }
   )
  }catch(e){
   setOpen(false);lockedRef.current=false
   setError((ar?'تعذر تشغيل الكاميرا: ':'Unable to start camera: ')+(e?.message||e))
  }
 }

 const passportAllowed=asset&&can('assets.view',asset.organization_id,asset.client_id,{site_id:asset.site_id})

 return <section className="facility-module qr-asset-scanner">
  <div className="page-head">
   <div>
    <h1>{ar?'مسح QR للأصل / الجهاز':'Medical Device QR Scanner'}</h1>
    <p className="muted">{ar
     ?'امسح الملصق بالكاميرا. إذا كان هناك أمر عمل نشط واحد يفتح مباشرة، وإلا يظهر لك الاختيار أو جواز الأصل حسب صلاحيتك.'
     :'Scan the label with the camera. One active work order opens directly; otherwise choose an order or open the asset passport according to your access.'}</p>
   </div>
  </div>

  {error&&<div className="alert error">{error}</div>}

  <div className="facility-panel">
   <div className="row-actions" style={{gap:10,flexWrap:'wrap'}}>
    <button type="button" className="btn primary" disabled={busy} onClick={open?stop:start}>
     {open?(ar?'إغلاق الكاميرا':'Close Camera'):(ar?'📷 فتح الكاميرا ومسح QR':'📷 Open Camera & Scan QR')}
    </button>
   </div>
   {open&&<div style={{marginTop:14,textAlign:'center'}}>
    <video ref={videoRef} playsInline muted style={{width:'100%',maxWidth:680,borderRadius:14,background:'#111'}}/>
    <p className="muted">{busy?(ar?'جاري فتح السجل...':'Opening record...'):(ar?'وجّه الكاميرا إلى رمز QR':'Point the camera at the QR code')}</p>
   </div>}
  </div>

  <form className="facility-panel" onSubmit={e=>{e.preventDefault();resolve(query)}}>
   <h2>{ar?'بحث يدوي بديل':'Manual fallback'}</h2>
   <div className="form-grid">
    <label>{ar?'رقم الأصل / السيريال / رابط QR':'Asset number / serial / QR URL'}
     <input value={query} onChange={e=>setQuery(e.target.value)}
      placeholder={ar?'مثال AST-000123 أو رقم السيريال':'e.g. AST-000123 or serial number'}/>
    </label>
   </div>
   <div className="form-actions">
    <button className="btn primary" disabled={busy||!query.trim()}>{busy?(ar?'جاري البحث...':'Searching...'):(ar?'فتح':'Open')}</button>
   </div>
  </form>

  {asset&&<div className="facility-panel">
   <h2>{asset.asset_tag||'—'} — {ar?(asset.name_ar||asset.name_en||''):(asset.name_en||asset.name_ar||'')}</h2>
   <p className="muted">{ar?'الحالة التشغيلية':'Operational status'}: {asset.operational_status||asset.status||'—'}</p>
   {orders.length>1&&<>
    <p><b>{ar?'يوجد أكثر من أمر عمل نشط. اختر المطلوب:':'Multiple active work orders found. Choose one:'}</b></p>
    <div className="row-actions" style={{flexWrap:'wrap'}}>
     {orders.map(w=><button type="button" className="btn primary" key={w.id} onClick={()=>navigate('/corrective/work_order/'+w.id)}>
      {w.work_order_number||w.title||w.id}
     </button>)}
    </div>
   </>}
   <div className="row-actions" style={{marginTop:12}}>
    {passportAllowed&&<button type="button" className="btn secondary" onClick={()=>navigate('/asset-passport/'+asset.id)}>
     {ar?'فتح جواز الجهاز الطبي':'Open Medical Device Passport'}
    </button>}
    {!passportAllowed&&orders.length!==1&&<span className="muted">{ar?'يمكنك فقط فتح السجلات المسموح بها حسب صلاحيتك.':'Only records allowed by your permissions can be opened.'}</span>}
   </div>
  </div>}
 </section>
}
