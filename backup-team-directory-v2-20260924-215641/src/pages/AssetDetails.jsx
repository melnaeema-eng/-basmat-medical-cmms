import {useEffect,useState} from 'react'
import {Link,useParams} from 'react-router-dom'
import QRCode from 'qrcode'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {loadAll,display,locationLabel,PUBLIC_ASSET_COLUMNS} from '../lib/facility'
import {Dialog,Notice,Status} from '../components/FacilityFields'
import AssetEditor from '../components/AssetEditor'
export default function AssetDetails(){
 const {id}=useParams(),{can}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState(null),[asset,setAsset]=useState(null),[events,setEvents]=useState([]),[qr,setQr]=useState(''),[cost,setCost]=useState(null),[open,setOpen]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const url=window.location.origin+'/assets/'+id
 const reload=async()=>{try{setCost(null);
  const [all,a,e]=await Promise.all([loadAll(),supabase.from('bf_assets').select(PUBLIC_ASSET_COLUMNS).eq('id',id).maybeSingle(),supabase.from('bf_asset_events').select('*').eq('asset_id',id).order('created_at',{ascending:false}).limit(100)])
  if(a.error)throw a.error;if(e.error)throw e.error
  setData(all);setAsset(a.data);setEvents(e.data||[])
  if(a.data&&can('assets.manage',a.data.organization_id)){
   const c=await supabase.rpc('bf3_asset_cost',{p_id:id})
   if(!c.error)setCost(c.data)
  }
 }catch(e){setError(e.message)}}
 useEffect(()=>{reload()},[id])
 useEffect(()=>{QRCode.toDataURL(url,{width:320,margin:2,errorCorrectionLevel:'M'}).then(setQr).catch(e=>setError(e.message))},[url])
 const row=(label,value)=><div className="detail-row"><span>{t(label)}</span><strong>{value??'—'}</strong></div>
 const date=value=>value?new Intl.DateTimeFormat(lang==='ar'?'ar-SA':'en-GB',{dateStyle:'medium'}).format(new Date(value)):'—'
 const download=()=>{if(!qr)return;const a=document.createElement('a');a.href=qr;a.download='BF-'+asset.asset_tag+'.png';a.click()}
 const print=()=>{
  if(!qr)return
  const w=window.open('','_blank','width=500,height=600')
  if(!w)return
  w.document.write('<!doctype html><html><head><title>Asset QR</title><style>body{font:16px Arial;text-align:center;padding:25px}img{width:280px}p{overflow-wrap:anywhere}</style></head><body><h2>Basmat Medical Equipment CMMS</h2><img alt="QR" src="'+qr+'"><h3>'+asset.asset_tag.replaceAll('&','&amp;').replaceAll('<','&lt;')+'</h3><p>'+url+'</p></body></html>')
  w.document.close();w.onload=()=>w.print()
 }
 if(!asset)return <section className="facility-module"><Link to="/assets">{t('back')}</Link><Notice error={error}/><p>{data?t('notFound'):t('loading')}</p></section>
 const info=[
  ['assetTag',asset.asset_tag],['nameAr',asset.name_ar],['nameEn',asset.name_en],
  ['category',display(data?.categories.find(c=>c.id===asset.category_id),lang)],
  ['organization',display(data?.organizations.find(o=>o.id===asset.organization_id),lang)],
  ['client',display(data?.clients.find(c=>c.id===asset.client_id),lang)],
  ['site',locationLabel(asset,data||{},lang)],['parentAsset',display(data?.assets.find(a=>a.id===asset.parent_asset_id),lang)],
  ['manufacturer',asset.manufacturer],['model',asset.model],['serialNumber',asset.serial_number],['capacity',asset.capacity],['unit',asset.unit],
  ['criticality',t(asset.criticality)],['condition',t(asset.condition)],['operationalStatus',t(asset.operational_status)],
  ['installationDate',date(asset.installation_date)],['commissioningDate',date(asset.commissioning_date)],['purchaseDate',date(asset.purchase_date)],
  ['warrantyStart',date(asset.warranty_start)],['warrantyEnd',date(asset.warranty_end)],['warrantyProvider',asset.warranty_provider],
  ['expectedLife',asset.expected_life_years],['description',asset.description],['notes',asset.notes]
 ]
 if(can('assets.manage',asset.organization_id)){info.push(['purchaseCost',cost?.purchase_cost],['replacementCost',cost?.replacement_cost])}
 return <section className="facility-module">
  <div className="page-head"><div><Link to="/assets">{t('back')}</Link><h1>{asset.asset_tag}</h1><p>{display(asset,lang)}</p></div><div className="row-actions">{can('assets.manage',asset.organization_id)&&<button className="btn primary" onClick={()=>setOpen(true)}>{t('edit')}</button>}</div></div>
  <Notice error={error} success={success}/>
  <div className="detail-grid"><div className="facility-panel"><h3>{t('assetDetails')}</h3><Status value={asset.status}/><div className="details-list">{info.map(([key,value])=><div key={key}>{row(key,value)}</div>)}</div></div>
   <div className="detail-side">
    <div className="facility-panel qr-card"><h3>{t('qr')}</h3>{qr&&<img src={qr} alt={t('qr')+' '+asset.asset_tag}/>}<p>{asset.asset_tag}</p><div className="row-actions"><button className="btn secondary" onClick={download}>{t('download')}</button><button className="btn secondary" onClick={print}>{t('print')}</button><button className="btn secondary" onClick={()=>navigator.clipboard?.writeText(url).then(()=>setSuccess(t('copy'))).catch(e=>setError(e.message))}>{t('copy')}</button></div></div>
    <div className="facility-panel"><h3>{t('history')}</h3>{events.length===0?<p>{t('noData')}</p>:<div className="event-list">{events.map(e=><div key={e.id} className="event-item"><strong>{t(e.action)}</strong><small>{date(e.created_at)} · {e.actor_id||'System'}</small><span>{e.details?.asset_tag}</span></div>)}</div>}</div>
   </div>
  </div>
  <Dialog open={open} title={t('edit')} onClose={()=>setOpen(false)}>{data&&<AssetEditor record={asset} data={data} onCancel={()=>setOpen(false)} onSaved={async()=>{setOpen(false);await reload();setSuccess(t('saved'))}}/>}</Dialog>
 </section>
}
