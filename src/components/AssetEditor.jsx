import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {save,active,display} from '../lib/facility'
import {loadMasterAssetLibrary} from '../lib/masterAssetLibrary'
import {Field,Choice,Select,Notice,FormActions} from './FacilityFields'
import {focusNextField} from '../lib/smartLanguage'
const blank={organization_id:'',client_id:'',site_id:'',building_id:'',floor_id:'',zone_id:'',room_id:'',category_id:'',parent_asset_id:'',asset_tag:'',name_ar:'',name_en:'',description:'',serial_number:'',manufacturer:'',model:'',capacity:'',unit:'',installation_date:'',commissioning_date:'',purchase_date:'',warranty_start:'',warranty_end:'',warranty_provider:'',purchase_cost:'',replacement_cost:'',expected_life_years:'',criticality:'medium',condition:'good',operational_status:'in_service',status:'active',notes:''}
const textFields=['serial_number','manufacturer','model','capacity','unit','warranty_provider']
const dates=['installation_date','commissioning_date','purchase_date','warranty_start','warranty_end']
const numbers=['purchase_cost','replacement_cost','expected_life_years']
const optional=['building_id','floor_id','zone_id','room_id','parent_asset_id',...textFields,...dates,...numbers,'description','notes']
export default function AssetEditor({record,data,initial={},onSaved,onCancel}){
 const {can}=useAuth(),{t,lang}=useLanguage()
 const [form,setForm]=useState({...blank,...initial,...record,asset_tag:record?.asset_tag||''}),[busy,setBusy]=useState(false),[costReady,setCostReady]=useState(!record),[error,setError]=useState('')
 const [library,setLibrary]=useState(null),[masterTypeId,setMasterTypeId]=useState(''),[manufacturerId,setManufacturerId]=useState(''),[modelFamily,setModelFamily]=useState('')
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
 useEffect(()=>{
  let live=true
  loadMasterAssetLibrary().then(x=>{if(live)setLibrary(x)}).catch(e=>{if(live)setError(e.message)})
  return()=>{live=false}
 },[])
 const set=(key,value)=>setForm(f=>({...f,[key]:value}))
 const orgs=active(data.organizations)
 const clients=active(data.clients).filter(x=>x.organization_id===form.organization_id)
 const sites=active(data.sites).filter(x=>x.organization_id===form.organization_id&&x.client_id===form.client_id)
 const buildings=active(data.buildings).filter(x=>x.site_id===form.site_id)
 const floors=active(data.floors).filter(x=>x.building_id===form.building_id)
 const zones=active(data.zones).filter(x=>x.floor_id===form.floor_id)
 const rooms=active(data.rooms).filter(x=>x.zone_id===form.zone_id)
 const categories=active(data.categories).filter(x=>x.organization_id===form.organization_id)
 const masterTypes=(library?.types||[]).filter(x=>x.status==='active')
 const libraryOptions=(library?.options||[]).filter(x=>x.status==='active'||x.status==null)
 const manufacturers=(library?.manufacturers||[]).filter(x=>x.status==='active'||x.status==null)
 const selectedType=masterTypes.find(x=>x.id===masterTypeId)
 const selectedTypeOptions=libraryOptions.filter(x=>x.asset_type_id===masterTypeId)
 const brandIds=[...new Set(selectedTypeOptions.map(x=>x.manufacturer_id).filter(Boolean))]
 const availableBrands=manufacturers.filter(x=>brandIds.includes(x.id))
 const availableModels=selectedTypeOptions.filter(x=>!manufacturerId||x.manufacturer_id===manufacturerId)
 const sameText=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase()
 const matchingCategory=(type)=>categories.find(c=>(type?.name_en&&sameText(c.name_en,type.name_en))||(type?.name_ar&&sameText(c.name_ar,type.name_ar)))
 const chooseMasterType=id=>{
  const type=masterTypes.find(x=>x.id===id)
  setMasterTypeId(id);setManufacturerId('');setModelFamily('')
  if(!type)return
  const cat=matchingCategory(type)
  setForm(f=>({...f,
   category_id:cat?.id||'',
   name_ar:type.name_ar||f.name_ar,
   name_en:type.name_en||f.name_en,
   description:type.description_ar||type.description_en||f.description,
   criticality:type.default_criticality||f.criticality,
   expected_life_years:type.expected_life_years??f.expected_life_years,
   manufacturer:'',
   model:''
  }))
 }
 const chooseBrand=id=>{
  setManufacturerId(id);setModelFamily('')
  const brand=manufacturers.find(x=>x.id===id)
  setForm(f=>({...f,manufacturer:brand?.name||'',model:''}))
 }
 const chooseModel=value=>{
  setModelFamily(value)
  setForm(f=>({...f,model:value||''}))
 }
 const parents=active(data.assets).filter(x=>x.organization_id===form.organization_id&&x.site_id===form.site_id&&x.id!==record?.id)
 useEffect(()=>{
  if(!record?.id||!library||masterTypeId)return
  const currentCategory=data.categories.find(c=>c.id===record.category_id)
  if(!currentCategory)return
  const type=(library.types||[]).find(x=>
   (x.name_en&&sameText(x.name_en,currentCategory.name_en))||
   (x.name_ar&&sameText(x.name_ar,currentCategory.name_ar))
  )
  if(type)setMasterTypeId(type.id)
 },[record?.id,library])

 const submit=async e=>{e.preventDefault();setBusy(true);setError('')
  try{
   if(!costReady)throw Error(t('loading'))
   if(!can('assets.manage',form.organization_id))throw Error(t('noPermission'))
   const site=data.sites.find(x=>x.id===form.site_id)
   if(!site||site.organization_id!==form.organization_id||site.client_id!==form.client_id)throw Error(t('required'))
   if(form.warranty_start&&form.warranty_end&&form.warranty_end<form.warranty_start)throw Error(t('end')+' < '+t('start'))
   let resolvedCategoryId=form.category_id
   if(masterTypeId){
    const type=masterTypes.find(x=>x.id===masterTypeId)
    if(!type)throw Error(lang==='ar'?'نوع الأصل غير موجود في المكتبة':'Asset type not found in library')
    const localMatch=matchingCategory(type)
    if(localMatch)resolvedCategoryId=localMatch.id
    if(!resolvedCategoryId){
     const {data:existing,error:findError}=await supabase.from('bf_asset_categories')
      .select('id,name_ar,name_en,status')
      .eq('organization_id',form.organization_id)
      .limit(500)
     if(findError)throw findError
     const found=(existing||[]).find(c=>(type.name_en&&sameText(c.name_en,type.name_en))||(type.name_ar&&sameText(c.name_ar,type.name_ar)))
     if(found)resolvedCategoryId=found.id
     else{
      const {data:created,error:createError}=await supabase.from('bf_asset_categories')
       .insert({
        organization_id:form.organization_id,
        name_ar:type.name_ar||type.name_en,
        name_en:type.name_en||type.name_ar,
        description:type.description_ar||type.description_en||null,
        status:'active'
       }).select('id').single()
      if(createError)throw createError
      resolvedCategoryId=created.id
     }
    }
   }
   if(!resolvedCategoryId)throw Error(lang==='ar'?'اختر الأصل من المكتبة أو التصنيف':'Select an asset from the library or a category')
   const payload={...form,category_id:resolvedCategoryId}
   delete payload.asset_tag
   for(const k of ['id','created_at','updated_at','created_by','updated_by'])delete payload[k]
   for(const k of optional)if(payload[k]==='')payload[k]=null
   for(const k of numbers)if(payload[k]!=null)payload[k]=Number(payload[k])
   const result=await save('bf_assets',payload,record?.id)
   onSaved(result)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const choice=(key,label,rows,required=false,disabled=false,reset=[])=> <Field label={t(label)} required={required}><Choice rows={rows} lang={lang} value={form[key]} required={required} disabled={disabled} onChange={v=>setForm(f=>({...f,[key]:v,...Object.fromEntries(reset.map(k=>[k,'']))}))}/></Field>
 const input=(key,label,type='text',required=false)=> <Field key={key} label={t(label)} required={required}><input type={type} required={required} min={type==='number'?'0':undefined} step={type==='number'?(key==='expected_life_years'?'1':'0.01'):undefined} value={form[key]??''} onChange={e=>set(key,e.target.value)} onBlur={e=>required&&e.target.value&&focusNextField(e.target)}/></Field>
 const opts=(key,values)=> <Field label={t(key)}><Select value={form[key]} onChange={v=>set(key,v)} options={values.map(v=>({value:v,label:t(v)}))}/></Field>
 return <form className="form-grid asset-form" onSubmit={submit}>
  <Notice error={error}/>
  <div className="form-section"><h3>{t('organization')}</h3></div>
  <Field label={t('organization')} required>
   <Choice rows={orgs} lang={lang} value={form.organization_id} required disabled={!!record}
    onChange={v=>{setForm(f=>({...f,organization_id:v,client_id:'',site_id:'',building_id:'',floor_id:'',zone_id:'',room_id:'',category_id:'',parent_asset_id:''}));setMasterTypeId('');setManufacturerId('');setModelFamily('')}}/>
  </Field>
  {choice('client_id','client',clients,true,!!record,['site_id','building_id','floor_id','zone_id','room_id','parent_asset_id'])}
  {choice('site_id','site',sites,true,!!record,['building_id','floor_id','zone_id','room_id','parent_asset_id'])}
  {masterTypes.length>0?<>
   <Field label={lang==='ar'?'الأصل من المكتبة':'Asset from library'} required={!record}>
    <select required={!record} value={masterTypeId} onChange={e=>chooseMasterType(e.target.value)}>
     <option value="">{lang==='ar'?'اختر الأصل':'Select asset'}</option>
     {masterTypes.map(x=><option key={x.id} value={x.id}>{x.icon_text||'🔧'} {lang==='ar'?(x.name_ar||x.name_en):(x.name_en||x.name_ar)}</option>)}
    </select>
   </Field>
   <Field label={lang==='ar'?'التصنيف':'Category'}>
    <input readOnly value={selectedType?(lang==='ar'?(selectedType.name_ar||selectedType.name_en):(selectedType.name_en||selectedType.name_ar)):(display(categories.find(c=>c.id===form.category_id),lang)||'—')}/>
   </Field>
   <Field label={lang==='ar'?'العلامة التجارية':'Brand'}>
    <select value={manufacturerId} disabled={!masterTypeId} onChange={e=>chooseBrand(e.target.value)}>
     <option value="">{lang==='ar'?'عام / أخرى':'Generic / Other'}</option>
     {availableBrands.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
   </Field>
   <Field label={lang==='ar'?'الموديل / السلسلة':'Model / Series'}>
    <select value={modelFamily} disabled={!masterTypeId||availableModels.length===0} onChange={e=>chooseModel(e.target.value)}>
     <option value="">{lang==='ar'?'اختر / أدخل يدوياً لاحقاً':'Select / enter manually below'}</option>
     {[...new Set(availableModels.map(x=>x.model_family).filter(Boolean))].map(x=><option key={x} value={x}>{x}</option>)}
    </select>
   </Field>
  </>:choice('category_id','category',categories,true)}
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
