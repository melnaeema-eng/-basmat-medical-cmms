import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {BrowserQRCodeReader} from '@zxing/browser'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'

const inactiveStatuses=new Set(['closed','completed','cancelled','canceled','archived'])

function candidateFrom(raw){
  const value=(raw||'').trim()
  if(!value)return ''
  try{
    const u=new URL(value)
    const parts=u.pathname.split('/').filter(Boolean)
    return parts.at(-1)||value
  }catch{return value}
}

export default function MobileAssetEntry(){
  const {lang}=useLanguage()
  const ar=lang==='ar'
  const navigate=useNavigate()
  const videoRef=useRef(null)
  const controlsRef=useRef(null)
  const lockedRef=useRef(false)

  const [mode,setMode]=useState('scan')
  const [query,setQuery]=useState('')
  const [camera,setCamera]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [asset,setAsset]=useState(null)
  const [orders,setOrders]=useState([])

  useEffect(()=>{
    const root=document.querySelector('.facility-module')
    if(!root)return
    const panels=[...root.querySelectorAll('.facility-panel')]
    for(const panel of panels){
      if(panel.hasAttribute('data-unified-asset-entry'))continue
      const text=(panel.textContent||'').toLowerCase()
      const oldArabic=text.includes('مسح qr')&&text.includes('البحث عن الأصل')
      const oldEnglish=text.includes('scan qr')&&text.includes('asset')
      if(oldArabic||oldEnglish)panel.style.display='none'
    }
  },[])

  const stopCamera=()=>{
    try{controlsRef.current?.stop?.()}catch{}
    controlsRef.current=null
    if(videoRef.current?.srcObject){
      try{videoRef.current.srcObject.getTracks().forEach(t=>t.stop())}catch{}
      videoRef.current.srcObject=null
    }
    lockedRef.current=false
    setCamera(false)
  }

  useEffect(()=>()=>stopCamera(),[])

  const resolveAsset=async raw=>{
    const value=candidateFrom(raw)
    if(!value)return
    setBusy(true);setError('');setAsset(null);setOrders([])
    try{
      let found=null
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

      if(uuid){
        const r=await supabase.from('bf_assets')
          .select('id,asset_tag,serial_number,name_ar,name_en,status')
          .eq('id',value).limit(1)
        if(r.error)throw r.error
        found=r.data?.[0]||null
      }

      if(!found){
        const safe=value.replaceAll(',',' ')
        const r=await supabase.from('bf_assets')
          .select('id,asset_tag,serial_number,name_ar,name_en,status')
          .or(`asset_tag.ilike.%${safe}%,serial_number.ilike.%${safe}%,name_ar.ilike.%${safe}%,name_en.ilike.%${safe}%`)
          .limit(5)
        if(r.error)throw r.error
        if(!r.data?.length)throw Error(ar?'لم يتم العثور على الأصل':'Asset not found')
        found=r.data[0]
      }

      const w=await supabase.from('bf_work_orders')
        .select('id,work_order_number,title,status,asset_id,priority,completion_due_at,created_at')
        .eq('asset_id',found.id)
        .order('created_at',{ascending:false})
        .limit(20)
      if(w.error)throw w.error

      const active=(w.data||[]).filter(x=>!inactiveStatuses.has(String(x.status||'').toLowerCase()))
      setAsset(found)
      setOrders(active)

      if(active.length===1){
        stopCamera()
        navigate('/corrective/work_order/'+active[0].id)
        return
      }
      if(active.length===0){
        stopCamera()
        navigate('/asset-passport/'+found.id)
        return
      }

      stopCamera()
    }catch(e){
      lockedRef.current=false
      setError(e.message||String(e))
    }finally{
      setBusy(false)
    }
  }

  const startCamera=async()=>{
    setError('');setAsset(null);setOrders([])
    if(!navigator.mediaDevices?.getUserMedia){
      setError(ar?'الكاميرا غير مدعومة في هذا المتصفح':'Camera is not supported in this browser')
      return
    }
    try{
      setCamera(true)
      await new Promise(r=>setTimeout(r,0))
      const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:250})
      const controls=await reader.decodeFromConstraints(
        {video:{facingMode:{ideal:'environment'}}},
        videoRef.current,
        result=>{
          if(!result?.getText?.()||lockedRef.current)return
          lockedRef.current=true
          resolveAsset(result.getText())
        }
      )
      controlsRef.current=controls
    }catch(e){
      setCamera(false)
      lockedRef.current=false
      setError((ar?'تعذر تشغيل الكاميرا: ':'Unable to start camera: ')+(e?.message||e))
    }
  }

  const switchMode=next=>{
    if(next!=='scan')stopCamera()
    setMode(next);setError('');setAsset(null);setOrders([])
  }

  return <div className="facility-panel" data-unified-asset-entry="true" style={{marginBottom:18}}>
    <div className="page-head">
      <div>
        <h2>{ar?'الوصول إلى الأصل':'Asset Access'}</h2>
        <p className="muted">{ar?'امسح QR أو أدخل رقم الأصل. يفتح أمر العمل النشط إن وجد، وإلا يفتح جواز الأصل.':'Scan QR or enter the asset number. An active work order opens if found; otherwise the Asset Passport opens.'}</p>
      </div>
    </div>

    <div className="row-actions" style={{marginBottom:14}}>
      <button type="button" className={'btn '+(mode==='scan'?'primary':'secondary')} onClick={()=>switchMode('scan')}>
        {ar?'📷 مسح QR':'📷 Scan QR'}
      </button>
      <button type="button" className={'btn '+(mode==='manual'?'primary':'secondary')} onClick={()=>switchMode('manual')}>
        {ar?'⌨ إدخال رقم الأصل':'⌨ Enter Asset Number'}
      </button>
    </div>

    {error&&<div className="alert error">{error}</div>}

    {mode==='scan'&&<>
      <button type="button" className="btn primary" onClick={camera?stopCamera:startCamera} disabled={busy}>
        {camera?(ar?'إغلاق الكاميرا':'Close Camera'):(ar?'فتح الكاميرا':'Open Camera')}
      </button>
      {camera&&<div style={{marginTop:12,textAlign:'center'}}>
        <video ref={videoRef} playsInline muted style={{width:'100%',maxWidth:620,borderRadius:14,background:'#111'}}/>
        <p className="muted">{busy?(ar?'جاري فتح الأصل...':'Opening asset...'):(ar?'وجّه الكاميرا إلى QR المثبت على الأصل':'Point the camera at the QR attached to the asset')}</p>
      </div>}
    </>}

    {mode==='manual'&&<form onSubmit={e=>{e.preventDefault();resolveAsset(query)}}>
      <div className="form-grid">
        <label>{ar?'رقم الأصل / Asset Tag / Serial':'Asset Number / Asset Tag / Serial'}
          <input autoFocus value={query} onChange={e=>setQuery(e.target.value)}
            placeholder={ar?'اكتب رقم الأصل أو السيريال':'Enter asset number or serial'}/>
        </label>
      </div>
      <div className="form-actions">
        <button className="btn primary" disabled={busy||!query.trim()}>
          {busy?(ar?'جاري البحث...':'Searching...'):(ar?'فتح الأصل':'Open Asset')}
        </button>
      </div>
    </form>}

    {asset&&orders.length>1&&<div className="alert" style={{marginTop:14}}>
      <b>{ar?'يوجد أكثر من أمر عمل نشط لهذا الأصل':'More than one active work order exists for this asset'}</b>
      <div className="row-actions" style={{marginTop:10,flexWrap:'wrap'}}>
        {orders.map(w=><button type="button" className="btn primary" key={w.id}
          onClick={()=>navigate('/corrective/work_order/'+w.id)}>
          {w.work_order_number||w.title||w.id}
        </button>)}
        <button type="button" className="btn secondary" onClick={()=>navigate('/asset-passport/'+asset.id)}>
          {ar?'فتح جواز الأصل':'Open Asset Passport'}
        </button>
      </div>
    </div>}
  </div>
}
