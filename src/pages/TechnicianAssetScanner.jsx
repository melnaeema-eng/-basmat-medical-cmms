import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'

function extractCandidate(raw){
 const v=(raw||'').trim(); if(!v)return ''
 try{const u=new URL(v);const parts=u.pathname.split('/').filter(Boolean);return parts.at(-1)||v}catch{return v}
}
export default function TechnicianAssetScanner(){
 const {lang}=useLanguage(), ar=lang==='ar', navigate=useNavigate()
 const videoRef=useRef(null),streamRef=useRef(null),timerRef=useRef(null)
 const [query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[camera,setCamera]=useState(false)
 const [recent,setRecent]=useState(()=>{try{return JSON.parse(localStorage.getItem('bf_recent_assets')||'[]')}catch{return []}})
 const remember=a=>{const next=[a,...recent.filter(x=>x.id!==a.id)].slice(0,8);setRecent(next);localStorage.setItem('bf_recent_assets',JSON.stringify(next))}
 const stopCamera=()=>{if(timerRef.current)clearInterval(timerRef.current);timerRef.current=null;streamRef.current?.getTracks?.().forEach(t=>t.stop());streamRef.current=null;setCamera(false)}
 const openAsset=async raw=>{
  const candidate=extractCandidate(raw);if(!candidate)return;setBusy(true);setError('')
  try{
   let r=await supabase.from('bf_assets').select('id,asset_tag,serial_number,name_ar,name_en,site_id,status').or(`asset_tag.ilike.%${candidate}%,serial_number.ilike.%${candidate}%,name_ar.ilike.%${candidate}%,name_en.ilike.%${candidate}%`).limit(2)
   if(r.error)throw r.error
   let data=r.data||[]
   if(!data.length&&/^[0-9a-fA-F-]{36}$/.test(candidate)){const x=await supabase.from('bf_assets').select('id,asset_tag,serial_number,name_ar,name_en,site_id,status').eq('id',candidate).limit(1);if(x.error)throw x.error;data=x.data||[]}
   if(!data.length)throw Error(ar?'لم يتم العثور على الأصل':'Asset not found')
   const a=data[0];remember(a);stopCamera();navigate('/asset-passport/'+a.id)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const startCamera=async()=>{
  setError('');if(!navigator.mediaDevices?.getUserMedia){setError(ar?'الكاميرا غير مدعومة في هذا المتصفح':'Camera is not supported in this browser');return}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});streamRef.current=stream
   if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play()}setCamera(true)
   if(!('BarcodeDetector' in window)){setError(ar?'الكاميرا مفتوحة، لكن قراءة QR التلقائية غير مدعومة هنا. استخدم Chrome/Edge حديث أو البحث اليدوي.':'Camera opened, but automatic QR decoding is unavailable. Use recent Chrome/Edge or manual search.');return}
   const detector=new window.BarcodeDetector({formats:['qr_code','code_128','ean_13','ean_8']})
   timerRef.current=setInterval(async()=>{try{if(videoRef.current?.readyState>=2){const codes=await detector.detect(videoRef.current);if(codes?.[0]?.rawValue)openAsset(codes[0].rawValue)}}catch{}},650)
  }catch(e){setError(e.message)}
 }
 useEffect(()=>()=>stopCamera(),[])
 return <section className="facility-module" dir={ar?'rtl':'ltr'}>
  <div className="page-head"><div><h1>{ar?'مسح QR والبحث عن الأصل':'QR Scan & Asset Search'}</h1><p className="muted">{ar?'للفني: امسح QR المثبت على الأصل أو ابحث بالرقم أو السيريال أو الاسم.':'Technician: scan the asset QR or search by tag, serial or name.'}</p></div></div>
  {error&&<div className="alert error">{error}</div>}
  <div className="facility-panel" style={{textAlign:'center'}}><button type="button" className="btn primary" style={{fontSize:18,padding:'14px 24px'}} onClick={camera?stopCamera:startCamera}>{camera?(ar?'إغلاق الكاميرا':'Close camera'):(ar?'📷 فتح الكاميرا لمسح QR':'📷 Open camera to scan QR')}</button><div style={{marginTop:16,display:camera?'block':'none'}}><video ref={videoRef} playsInline muted style={{width:'100%',maxWidth:620,borderRadius:14,background:'#111'}}/></div></div>
  <form className="facility-panel" onSubmit={e=>{e.preventDefault();openAsset(query)}}><h2>{ar?'بحث يدوي':'Manual search'}</h2><div className="form-grid"><label>{ar?'Asset Tag / Serial / اسم الأصل / رابط QR':'Asset Tag / Serial / Asset name / QR URL'}<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={ar?'مثال: AST-000123 أو رقم السيريال':'e.g. AST-000123 or serial number'}/></label></div><div className="form-actions"><button className="btn primary" disabled={busy||!query.trim()}>{busy?(ar?'جاري البحث...':'Searching...'):(ar?'بحث عن الأصل':'Find asset')}</button></div></form>
  {!!recent.length&&<div className="facility-panel"><h2>{ar?'آخر الأصول':'Recent assets'}</h2><div className="security-check-list">{recent.map(a=><button type="button" className="btn secondary" key={a.id} onClick={()=>navigate('/asset-passport/'+a.id)} style={{justifyContent:'space-between'}}><b>{a.asset_tag||'Asset'}</b><span>{ar?(a.name_ar||a.name_en||''):(a.name_en||a.name_ar||'')}</span></button>)}</div></div>}
 </section>
}
