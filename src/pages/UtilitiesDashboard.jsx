import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadUtilities,createUtilityMeter,addUtilityReading} from '../lib/utilities'

const iso=d=>d.toISOString().slice(0,10)
const localNow=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)

export default function UtilitiesDashboard(){
 const {t}=useLanguage()
 const today=new Date(),start=new Date(Date.now()-30*86400000)
 const [from,setFrom]=useState(iso(start)),[to,setTo]=useState(iso(today))
 const [data,setData]=useState({meters:[],sites:[],assets:[],summary:{},recent_readings:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [meter,setMeter]=useState({site_id:'',asset_id:'',code:'',name:'',meter_type:'electricity',unit:'kWh',target_daily:'',notes:''})
 const [reading,setReading]=useState({meter_id:'',reading_at:localNow(),reading_value:'',notes:''})

 const load=async()=>{
  setBusy(true);setError('')
  try{
   const x=await loadUtilities({from,to})
   setData(x)
   if(!meter.site_id&&x.sites?.[0])setMeter(v=>({...v,site_id:x.sites[0].id}))
   if(!reading.meter_id&&x.meters?.[0])setReading(v=>({...v,meter_id:x.meters[0].id}))
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 useEffect(()=>{load()},[])

 const siteAssets=(data.assets||[]).filter(a=>a.site_id===meter.site_id)

 const saveMeter=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await createUtilityMeter(meter)
   setMeter(v=>({...v,asset_id:'',code:'',name:'',target_daily:'',notes:''}))
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const saveReading=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   await addUtilityReading(reading)
   setReading(v=>({...v,reading_at:localNow(),reading_value:'',notes:''}))
   await load()
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }

 const s=data.summary||{}
 const typeLabel=x=>({electricity:t('utilitiesElectric'),water:t('utilitiesWaterType'),gas:t('utilitiesGas'),diesel:t('utilitiesDiesel'),other:t('utilitiesOther')}[x]||x)

 return <section className="facility-module">
  <div className="page-head"><div><h1>{t('utilitiesCenter')}</h1></div><button className="btn secondary" onClick={load} disabled={busy}>{t('utilitiesRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className="facility-panel"><div className="form-grid">
   <label>{t('utilitiesFrom')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label>{t('utilitiesTo')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
  </div><button className="btn primary" onClick={load} disabled={busy}>{t('utilitiesApply')}</button></div>

  <div className="stats-grid facility-stats">
   <div className="stat-card"><span>{t('utilitiesMeters')}</span><strong>{s.meters||0}</strong></div>
   <div className="stat-card"><span>{t('utilitiesElectricity')}</span><strong>{s.electricity||0}</strong></div>
   <div className="stat-card"><span>{t('utilitiesWater')}</span><strong>{s.water||0}</strong></div>
   <div className="stat-card"><span>{t('utilitiesAnomalies')}</span><strong>{s.anomalies||0}</strong></div>
   <div className="stat-card"><span>{t('utilitiesReadings')}</span><strong>{s.readings||0}</strong></div>
  </div>

  <form className="facility-panel" onSubmit={saveMeter}><h2>{t('utilitiesAddMeter')}</h2><div className="form-grid">
   <label>{t('utilitiesSite')}<select required value={meter.site_id} onChange={e=>setMeter(v=>({...v,site_id:e.target.value,asset_id:''}))}><option value="">—</option>{data.sites?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('utilitiesAsset')}<select value={meter.asset_id} onChange={e=>setMeter(v=>({...v,asset_id:e.target.value}))}><option value="">—</option>{siteAssets.map(x=><option key={x.id} value={x.id}>{x.asset_tag} — {x.name}</option>)}</select></label>
   <label>{t('utilitiesCode')}<input required minLength={2} value={meter.code} onChange={e=>setMeter(v=>({...v,code:e.target.value}))}/></label>
   <label>{t('utilitiesName')}<input required minLength={2} value={meter.name} onChange={e=>setMeter(v=>({...v,name:e.target.value}))}/></label>
   <label>{t('utilitiesType')}<select value={meter.meter_type} onChange={e=>setMeter(v=>({...v,meter_type:e.target.value,unit:e.target.value==='electricity'?'kWh':e.target.value==='water'?'m3':v.unit}))}>{['electricity','water','gas','diesel','other'].map(x=><option key={x} value={x}>{typeLabel(x)}</option>)}</select></label>
   <label>{t('utilitiesUnit')}<select value={meter.unit} onChange={e=>setMeter(v=>({...v,unit:e.target.value}))}>{['kWh','MWh','m3','L','kg','other'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label>{t('utilitiesTarget')}<input type="number" min="0" step="0.0001" value={meter.target_daily} onChange={e=>setMeter(v=>({...v,target_daily:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy}>{t('utilitiesSaveMeter')}</button></form>

  <form className="facility-panel" onSubmit={saveReading}><h2>{t('utilitiesAddReading')}</h2><div className="form-grid">
   <label>{t('utilitiesMeter')}<select required value={reading.meter_id} onChange={e=>setReading(v=>({...v,meter_id:e.target.value}))}><option value="">—</option>{data.meters?.filter(x=>x.status==='active').map(x=><option key={x.id} value={x.id}>{x.code} — {x.name}</option>)}</select></label>
   <label>{t('utilitiesReadingAt')}<input required type="datetime-local" value={reading.reading_at} onChange={e=>setReading(v=>({...v,reading_at:e.target.value}))}/></label>
   <label>{t('utilitiesReadingValue')}<input required type="number" min="0" step="0.0001" value={reading.reading_value} onChange={e=>setReading(v=>({...v,reading_value:e.target.value}))}/></label>
  </div><button className="btn primary" disabled={busy||!reading.meter_id}>{t('utilitiesSaveReading')}</button></form>

  <div className="facility-panel">{!data.meters?.length?<p>{t('utilitiesNoData')}</p>:<div className="table-wrap"><table><thead><tr><th>{t('utilitiesMeter')}</th><th>{t('utilitiesSite')}</th><th>{t('utilitiesType')}</th><th>{t('utilitiesConsumption')}</th><th>{t('utilitiesAvgDaily')}</th><th>{t('utilitiesTarget')}</th><th>{t('utilitiesVariance')}</th><th>{t('utilitiesLastReading')}</th></tr></thead><tbody>{data.meters.map(x=><tr key={x.id}><td>{x.code} — {x.name}{x.anomaly?' ⚠':''}</td><td>{x.site_name}</td><td>{typeLabel(x.meter_type)} · {x.unit}</td><td>{x.consumption}</td><td>{x.avg_daily}</td><td>{x.target_daily??'—'}</td><td>{x.target_variance_pct??'—'}</td><td>{x.last_reading_value??'—'}</td></tr>)}</tbody></table></div>}</div>

  <div className="facility-panel"><h2>{t('utilitiesRecent')}</h2>{!data.recent_readings?.length?<p>{t('utilitiesNoData')}</p>:<div className="event-list">{data.recent_readings.map(x=><div className="event-item" key={x.id}><strong>{x.code} — {x.reading_value} {x.unit}</strong><span>{new Date(x.reading_at).toLocaleString()} · {x.full_name||x.email||''}</span></div>)}</div>}</div>
 </section>
}
