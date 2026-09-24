import {useEffect,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function extractCoords(text){
  const s=(text||'').trim()
  if(!s)return null
  const patterns=[
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)[,%20+\s]+(-?\d+(?:\.\d+)?)/i,
    /(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)/
  ]
  for(const p of patterns){
    const m=s.match(p)
    if(!m)continue
    const lat=Number(m[1]),lng=Number(m[2])
    if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180){
      return {lat,lng}
    }
  }
  return null
}

export default function SiteGeoFields({kind,form,set,lang}){
  const ar=lang==='ar'
  const mapEl=useRef(null)
  const mapRef=useRef(null)
  const markerRef=useRef(null)
  const [link,setLink]=useState('')
  const [message,setMessage]=useState('')
  const lat=form?.latitude
  const lng=form?.longitude
  const valid=lat!==''&&lat!=null&&lng!==''&&lng!=null&&
    Number(lat)>=-90&&Number(lat)<=90&&Number(lng)>=-180&&Number(lng)<=180

  const apply=(latitude,longitude,source)=>{
    const a=Number(latitude),b=Number(longitude)
    if(!Number.isFinite(a)||!Number.isFinite(b)||a<-90||a>90||b<-180||b>180){
      setMessage(ar?'الإحداثيات غير صحيحة':'Invalid coordinates')
      return
    }
    set('latitude',String(a))
    set('longitude',String(b))
    set('location_source',source||'manual')
    setMessage(ar?'✓ تم تحديد الموقع الجغرافي':'✓ Geographic location set')
    if(mapRef.current){
      mapRef.current.setView([a,b],16)
      if(markerRef.current)markerRef.current.setLatLng([a,b])
      else markerRef.current=L.circleMarker([a,b],{radius:8}).addTo(mapRef.current)
    }
  }

  useEffect(()=>{
    if(kind!=='sites'||!mapEl.current||mapRef.current)return
    const start=valid?[Number(lat),Number(lng)]:[24.7136,46.6753]
    const map=L.map(mapEl.current,{zoomControl:true}).setView(start,valid?16:10)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'© OpenStreetMap'
    }).addTo(map)
    if(valid)markerRef.current=L.circleMarker(start,{radius:8}).addTo(map)
    map.on('click',e=>apply(e.latlng.lat,e.latlng.lng,'map'))
    mapRef.current=map
    setTimeout(()=>map.invalidateSize(),50)
    return ()=>{
      map.remove()
      mapRef.current=null
      markerRef.current=null
    }
  },[kind])

  useEffect(()=>{
    if(!valid||!mapRef.current)return
    const p=[Number(lat),Number(lng)]
    if(markerRef.current)markerRef.current.setLatLng(p)
    else markerRef.current=L.circleMarker(p,{radius:8}).addTo(mapRef.current)
  },[lat,lng])

  if(kind!=='sites')return null

  const useGps=()=>{
    setMessage('')
    if(!navigator.geolocation){
      setMessage(ar?'GPS غير مدعوم في هذا الجهاز':'GPS is not supported on this device')
      return
    }
    navigator.geolocation.getCurrentPosition(
      p=>apply(p.coords.latitude,p.coords.longitude,'gps'),
      e=>setMessage((ar?'تعذر الحصول على الموقع: ':'Unable to get location: ')+e.message),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    )
  }

  const parseLink=()=>{
    const c=extractCoords(link)
    if(!c){
      setMessage(ar
        ?'الرابط لا يحتوي إحداثيات مباشرة. افتح الرابط في الخرائط وانسخ رابطاً يظهر فيه Latitude/Longitude، أو استخدم GPS/الخريطة.'
        :'The link does not contain direct coordinates. Copy a map URL containing latitude/longitude, or use GPS/map.')
      return
    }
    apply(c.lat,c.lng,'map_link')
  }

  return <div style={{gridColumn:'1 / -1',borderTop:'1px solid #e4e8ee',paddingTop:14,marginTop:6}}>
    <h3 style={{margin:'0 0 10px'}}>{ar?'الموقع الجغرافي':'Geographic Location'}</h3>

    <div className="form-grid">
      <label>{ar?'رابط الموقع':'Map link'}
        <input value={link} onChange={e=>setLink(e.target.value)}
          placeholder="https://www.google.com/maps/@24.7136,46.6753,16z"/>
      </label>
      <div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap'}}>
        <button type="button" className="btn secondary" onClick={parseLink}>
          {ar?'استخراج من الرابط':'Extract from link'}
        </button>
        <button type="button" className="btn primary" onClick={useGps}>
          {ar?'📍 استخدام موقعي الحالي':'📍 Use my current location'}
        </button>
      </div>

      <label>Latitude
        <input type="number" step="any" min="-90" max="90"
          value={lat??''}
          onChange={e=>{set('latitude',e.target.value);set('location_source','manual')}}/>
      </label>
      <label>Longitude
        <input type="number" step="any" min="-180" max="180"
          value={lng??''}
          onChange={e=>{set('longitude',e.target.value);set('location_source','manual')}}/>
      </label>
    </div>

    <div style={{marginTop:12}}>
      <div style={{fontWeight:700,marginBottom:6}}>
        {ar?'🗺️ اضغط على الخريطة لتحديد الموقع':'🗺️ Click the map to select the site'}
      </div>
      <div ref={mapEl} style={{height:280,width:'100%',borderRadius:12,overflow:'hidden',border:'1px solid #d9e0e8'}}/>
    </div>

    <div className={valid?'alert success':'alert'} style={{marginTop:10}}>
      {valid
        ?(ar?`✓ الموقع محدد: ${lat}, ${lng}`:`✓ Location set: ${lat}, ${lng}`)
        :(message||(ar?'الموقع النشط يحتاج Latitude وLongitude قبل الحفظ.':'An active site requires latitude and longitude before saving.'))}
    </div>
  </div>
}
