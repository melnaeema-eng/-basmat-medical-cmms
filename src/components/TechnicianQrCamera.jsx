import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {BrowserQRCodeReader} from '@zxing/browser'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'

function qrValue(raw){
  const value=(raw||'').trim()
  if(!value)return ''
  try{
    const u=new URL(value)
    const parts=u.pathname.split('/').filter(Boolean)
    return parts.at(-1)||value
  }catch{return value}
}

export default function TechnicianQrCamera(){
  const {lang}=useLanguage()
  const ar=lang==='ar'
  const navigate=useNavigate()
  const videoRef=useRef(null)
  const controlsRef=useRef(null)
  const readerRef=useRef(null)
  const lockedRef=useRef(false)
  const [open,setOpen]=useState(false)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)

  const stop=()=>{
    try{controlsRef.current?.stop?.()}catch{}
    controlsRef.current=null
    readerRef.current=null
    if(videoRef.current?.srcObject){
      try{videoRef.current.srcObject.getTracks().forEach(t=>t.stop())}catch{}
      videoRef.current.srcObject=null
    }
    setOpen(false)
    lockedRef.current=false
  }

  const findAsset=async raw=>{
    if(lockedRef.current)return
    const candidate=qrValue(raw)
    if(!candidate)return
    lockedRef.current=true
    setBusy(true);setError('')
    try{
      let data=null,error=null
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)

      if(uuid){
        const r=await supabase.from('bf_assets')
          .select('id,asset_tag,serial_number,name_ar,name_en')
          .eq('id',candidate)
          .limit(1)
        data=r.data;error=r.error
      }

      if(!data?.length&&!error){
        const safe=candidate.replaceAll(',',' ')
        const r=await supabase.from('bf_assets')
          .select('id,asset_tag,serial_number,name_ar,name_en')
          .or(`asset_tag.ilike.%${safe}%,serial_number.ilike.%${safe}%,name_ar.ilike.%${safe}%,name_en.ilike.%${safe}%`)
          .limit(2)
        data=r.data;error=r.error
      }

      if(error)throw error
      if(!data?.length)throw Error(ar?'لم يتم العثور على الأصل من رمز QR':'No asset was found for this QR code')

      stop()
      navigate('/asset-passport/'+data[0].id)
    }catch(e){
      lockedRef.current=false
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const start=async()=>{
    setError('')
    if(!navigator.mediaDevices?.getUserMedia){
      setError(ar?'الكاميرا غير مدعومة في هذا المتصفح':'Camera is not supported in this browser')
      return
    }

    try{
      setOpen(true)
      await new Promise(r=>setTimeout(r,0))

      const reader=new BrowserQRCodeReader(undefined,{delayBetweenScanAttempts:300})
      readerRef.current=reader

      const controls=await reader.decodeFromConstraints(
        {video:{facingMode:{ideal:'environment'}}},
        videoRef.current,
        (result)=>{
          if(result?.getText?.())findAsset(result.getText())
        }
      )
      controlsRef.current=controls
    }catch(e){
      setOpen(false)
      setError((ar?'تعذر تشغيل قارئ QR: ':'Unable to start QR reader: ')+(e?.message||e))
    }
  }

  useEffect(()=>()=>stop(),[])

  return <div className="facility-panel" style={{marginBlock:'16px'}}>
    <div className="page-head">
      <div>
        <h2>{ar?'مسح QR بالكاميرا':'Scan QR with Camera'}</h2>
        <p className="muted">{ar
          ?'وجّه كاميرا الجوال إلى QR المثبت على الأصل. بعد القراءة يفتح جواز الأصل مباشرة.'
          :'Point the phone camera at the asset QR. After scanning, the Asset Passport opens directly.'}</p>
      </div>
      <button type="button" className="btn primary" onClick={open?stop:start} disabled={busy}>
        {open?(ar?'إغلاق الكاميرا':'Close camera'):(ar?'📷 فتح الكاميرا':'📷 Open camera')}
      </button>
    </div>

    {error&&<div className="alert error">{error}</div>}

    {open&&<div style={{marginTop:12,textAlign:'center'}}>
      <video ref={videoRef} playsInline muted
        style={{width:'100%',maxWidth:620,borderRadius:14,background:'#111'}}/>
      <p className="muted">
        {busy
          ?(ar?'جاري فتح الأصل...':'Opening asset...')
          :(ar?'ضع رمز QR داخل إطار الكاميرا':'Place the QR code inside the camera view')}
      </p>
    </div>}
  </div>
}
