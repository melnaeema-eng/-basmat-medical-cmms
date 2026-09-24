import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {save,active,display} from '../lib/facility'
import {Field,Choice,Select,Notice,FormActions} from './FacilityFields'
const blank={organization_id:'',client_id:'',site_id:'',building_id:'',floor_id:'',zone_id:'',room_id:'',category_id:'',parent_asset_id:'',asset_tag:'',name_ar:'',name_en:'',description:'',serial_number:'',manufacturer:'',model:'',capacity:'',unit:'',installation_date:'',commissioning_date:'',purchase_date:'',warranty_start:'',warranty_end:'',warranty_provider:'',purchase_cost:'',replacement_cost:'',expected_life_years:'',criticality:'medium',condition:'good',operational_status:'in_service',status:'active',notes:''}
const textFields=['serial_number','manufacturer','model','capacity','unit','warranty_provider']
const dates=['installation_date','commissioning_date','purchase_date','warranty_start','warranty_end']
const numbers=['purchase_cost','replacement_cost','expected_life_years']
const optional=['building_id','floor_id','zone_id','room_id','parent_asset_id',...textFields,...dates,...numbers,'description','notes']
export default function AssetEditor({record,data,initial={},onSaved,onCancel}){
 const {can}=useAuth(),{t,lang}=useLanguage()
 const [form,setForm]=useState({...blank,...initial,...record,asset_tag:record?.asset_tag||''}),[busy,setBusy]=useState(false),[costReady,setCostReady]=useState(!record),[error,setError]=useState('')
 useEffect(()=>{
  let activeRequest=true
  setForm({...blank,...initial,...record,asset_tag:record?.asset_tag||''})
  setCostReady(!record?.id)
  if(record?.id) supabase.rpc('bf3_asset_cost',{p_id:record.id}).then(({data,error})=>{
   if(activeRequest&&data&&!error){setForm(f=>({...f,...data}));setCostReady(true)}
   if(activeRequest&&error){setError(error.message);setCostReady(false)}
  })
  return()=>{activeRequest=false}
 },[record?.id])
 const set=(key,value)=>setForm(f=>({...f,[key]:value}))
 const orgs=active(data.organizations)
 const clients=active(data.clients).filter(x=>x.organization_id===form.organization_id)
 const sites=active(data.sites).filter(x=>x.organization_id===form.organization_id&&x.client_id===form.client_id)
 const buildings=active(data.buildings).filter(x=>x.site_id===form.site_id)
 const floors=active(data.floors).filter(x=>x.building_id===form.building_id)
 const zones=active(data.zones).filter(x=>x.floor_id===form.floor_id)
 const rooms=active(data.rooms).filter(x=>x.zone_id===form.zone_id)
 const categories=active(data.categories).filter(x=>x.organization_id===form.organization_id)
 const parents=active(data.assets).filter(x=>x.organization_id===form.organization_id&&x.site_id===form.site_id&&x.id!==record?.id)
 const submit=async e=>{e.preventDefault();setBusy(true);setError('')
  try{
   if(!costReady)throw Error(t('loading'))
   if(!can('assets.manage',form.organization_id))throw Error(t('noPermission'))
   const site=data.sites.find(x=>x.id===form.site_id)
   if(!site||site.organization_id!==form.organization_id||site.client_id!==form.client_id)throw Error(t('required'))
   if(form.warranty_start&&form.warranty_end&&form.warranty_end<form.warranty_start)throw Error(t('end')+' < '+t('start'))
   const payload={...form}
   delete payload.asset_tag
   for(const k of ['id','created_at','updated_at','created_by','updated_by'])delete payload[k]
   for(const k of optional)if(payload[k]==='')payload[k]=null
   for(const k of numbers)if(payload[k]!=null)payload[k]=Number(payload[k])
   const result=await save('bf_assets',payload,record?.id)
   onSaved(result)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const choice=(key,label,rows,required=false,disabled=false,reset=[])=> <Field label={t(label)} required={required}><Choice rows={rows} lang={lang} value={form[key]} required={required} disabled={disabled} onChange={v=>setForm(f=>({...f,[key]:v,...Object.fromEntries(reset.map(k=>[k,'']))}))}/></Field>
 const input=(key,label,type='text',required=false)=> <Field key={key} label={t(label)} required={required}><input type={type} required={required} min={type==='number'?'0':undefined} step={type==='number'?(key==='expected_life_years'?'1':'0.01'):undefined} value={form[key]??''} onChange={e=>set(key,e.target.value)}/></Field>
 const opts=(key,values)=> <Field label={t(key)}><Select value={form[key]} onChange={v=>set(key,v)} options={values.map(v=>({value:v,label:t(v)}))}/></Field>
 return <form className="form-grid asset-form" onSubmit={submit}>
  <Notice error={error}/>
  <div className="form-section"><h3>{t('organization')}</h3></div>
  {choice('organization_id','organization',orgs,true,!!record,['client_id','site_id','building_id','floor_id','zone_id','room_id','category_id','parent_asset_id'])}
  {choice('client_id','client',clients,true,!!record,['site_id','building_id','floor_id','zone_id','room_id','parent_asset_id'])}
  {choice('site_id','site',sites,true,!!record,['building_id','floor_id','zone_id','room_id','parent_asset_id'])}
  {choice('category_id','category',categories,true)}
  <Field label={t('assetTag')}><input value={form.asset_tag||'Auto-generated on save / يُنشأ عند الحفظ'} readOnly/></Field>
  {input('serial_number','serialNumber')}
  {input('name_ar','nameAr','text',true)}{input('name_en','nameEn','text',true)}
  <Field label={t('description')} wide><textarea value={form.description||''} onChange={e=>set('description',e.target.value)}/></Field>
  <div className="form-section"><h3>{t('locations')}</h3></div>
  {choice('building_id','buildings',buildings,false,false,['floor_id','zone_id','room_id'])}
  {choice('floor_id','floors',floors,false,!form.building_id,['zone_id','room_id'])}
  {choice('zone_id','zones',zones,false,!form.floor_id,['room_id'])}
  {choice('room_id','rooms',rooms,false,!form.zone_id)}
  {choice('parent_asset_id','parentAsset',parents)}
  <div className="form-section"><h3>{t('assetDetails')}</h3></div>
  {textFields.slice(1,5).map(k=>input(k,k))}
  {opts('criticality',['low','medium','high','critical'])}
  {opts('condition',['excellent','good','fair','poor','failed'])}
  {opts('operational_status',['in_service','out_of_service','under_maintenance','disposed'])}
  {opts('status',['active','inactive','archived'])}
  <div className="form-section"><h3>{t('warrantyStart')} / {t('warrantyEnd')}</h3></div>
  {dates.map(k=>input(k,{installation_date:'installationDate',commissioning_date:'commissioningDate',purchase_date:'purchaseDate',warranty_start:'warrantyStart',warranty_end:'warrantyEnd'}[k],'date'))}
  {input('warranty_provider','warrantyProvider')}
  {numbers.map(k=>input(k,{purchase_cost:'purchaseCost',replacement_cost:'replacementCost',expected_life_years:'expectedLife'}[k],'number'))}
  <Field label={t('notes')} wide><textarea rows="3" value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></Field>
  <FormActions busy={busy||!costReady} onCancel={onCancel}/>
 </form>
}
