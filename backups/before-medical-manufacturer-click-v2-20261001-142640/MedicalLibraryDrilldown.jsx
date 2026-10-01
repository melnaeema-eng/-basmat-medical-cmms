import {useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabaseClient'

const txt=(x,...keys)=>{
 for(const k of keys){
  const v=x?.[k]
  if(v!==null&&v!==undefined&&String(v).trim()!=='')return v
 }
 return ''
}

export default function MedicalLibraryDrilldown({lang='en',selection,options=[],onRegister}){
 const [catalog,setCatalog]=useState({templates:[],steps:[],steps_source:null})
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [modelId,setModelId]=useState('')

 useEffect(()=>{
  if(!selection)return
  let alive=true
  ;(async()=>{
   setBusy(true);setError('')
   const {data,error}=await supabase.rpc('bf_med_library_maintenance_catalog')
   if(!alive)return
   if(error){setError(error.message);setCatalog({templates:[],steps:[],steps_source:null})}
   else setCatalog(data||{templates:[],steps:[],steps_source:null})
   setBusy(false)
  })()
  return()=>{alive=false}
 },[selection?.type?.id,selection?.manufacturer?.id])

 const models=useMemo(()=>{
  if(!selection)return[]
  return (options||[]).filter(o=>
   String(o.asset_type_id)===String(selection.type.id) &&
   String(o.manufacturer_id)===String(selection.manufacturer.id)
  )
 },[selection,options])

 const selectedModel=models.find(x=>String(x.id)===String(modelId))||models[0]||null

 const templates=useMemo(()=>{
  if(!selection)return[]
  return (catalog.templates||[]).filter(t=>{
   const typeId=txt(t,'master_type_id','asset_type_id','type_id')
   const mfrId=txt(t,'manufacturer_id')
   const optionId=txt(t,'option_id','master_option_id')
   const typeOK=!typeId||String(typeId)===String(selection.type.id)
   const mfrOK=!mfrId||String(mfrId)===String(selection.manufacturer.id)
   const optionOK=!optionId||!selectedModel||String(optionId)===String(selectedModel.id)
   return typeOK&&mfrOK&&optionOK
  })
 },[catalog.templates,selection,selectedModel])

 const stepsFor=t=>(catalog.steps||[])
  .filter(s=>String(txt(s,'template_id','pm_template_id'))===String(t.id))
  .sort((a,b)=>Number(a.seq||a.sequence||0)-Number(b.seq||b.sequence||0))

 if(!selection)return null
 const typeName=lang==='ar'?(selection.type.name_ar||selection.type.name_en):(selection.type.name_en||selection.type.name_ar)

 return <div className="facility-panel" style={{marginTop:14,border:'2px solid #dfe7ef'}}>
  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
   <div style={{fontSize:28}}>{selection.type.icon_text||'🏥'}</div>
   <div style={{marginInlineEnd:'auto'}}>
    <h2 style={{margin:0}}>{typeName} → {selection.manufacturer.name}</h2>
    <small>{lang==='ar'?'الموديلات وبرامج الصيانة وخطوات التنفيذ':'Models, maintenance programs and execution steps'}</small>
   </div>
  </div>

  {error&&<div className="bafm-error" style={{marginTop:10}}>{error}</div>}
  {busy&&<p>{lang==='ar'?'جاري تحميل برامج الصيانة...':'Loading maintenance programs...'}</p>}

  <div style={{marginTop:14}}>
   <h3>{lang==='ar'?'الموديلات':'Models'}</h3>
   {models.length? <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {models.map(m=><button type="button" key={m.id}
      className={`btn ${String(selectedModel?.id)===String(m.id)?'primary':''}`}
      onClick={()=>setModelId(m.id)}>
      {m.model_family||m.model||m.name||'Model'}
    </button>)}
   </div>:<p>{lang==='ar'?'لا توجد موديلات معرفة لهذه الشركة بعد.':'No models are defined for this manufacturer yet.'}</p>}
  </div>

  <div style={{marginTop:16}}>
   <h3>{lang==='ar'?'برامج الصيانة الوقائية PPM':'Preventive Maintenance PPM'}</h3>
   {!templates.length&&<p>{lang==='ar'?'لا يوجد قالب PPM مطابق لهذا الاختيار حاليًا.':'No matching PPM template is currently defined.'}</p>}
   {templates.map(t=>{
    const steps=stepsFor(t)
    return <div key={t.id} style={{border:'1px solid #dfe7ef',borderRadius:10,padding:12,marginBottom:10}}>
     <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <strong style={{marginInlineEnd:'auto'}}>{lang==='ar'?(t.title_ar||t.title_en||t.name_ar||t.name_en):(t.title_en||t.title_ar||t.name_en||t.name_ar)}</strong>
      <span>{lang==='ar'?'التكرار':'Interval'}: {t.frequency||((t.interval_months||'—')+' months')}</span>
      {(t.estimated_minutes||t.duration_minutes)&&<span>{t.estimated_minutes||t.duration_minutes} min</span>}
     </div>
     {(t.reference||t.source_document||t.source_name)&&<div style={{marginTop:6}}><b>{lang==='ar'?'المرجع':'Reference'}:</b> {t.reference||t.source_document||t.source_name}</div>}
     {(t.required_tools||t.required_test_equipment||t.required_ppe||t.required_consumables)&&
      <div style={{marginTop:6,fontSize:13}}>
       {t.required_tools&&<div><b>{lang==='ar'?'الأدوات':'Tools'}:</b> {String(t.required_tools)}</div>}
       {t.required_test_equipment&&<div><b>{lang==='ar'?'أجهزة الاختبار':'Test equipment'}:</b> {String(t.required_test_equipment)}</div>}
       {t.required_ppe&&<div><b>PPE:</b> {String(t.required_ppe)}</div>}
       {t.required_consumables&&<div><b>{lang==='ar'?'المستهلكات':'Consumables'}:</b> {String(t.required_consumables)}</div>}
      </div>}
     <div style={{marginTop:10}}>
      <b>{lang==='ar'?'إجراءات وخطوات الصيانة':'Maintenance procedures & steps'}:</b>
      {steps.length? <ol style={{marginTop:8}}>
       {steps.map(s=><li key={s.id} style={{marginBottom:10}}>
        <div><strong>{lang==='ar'?(s.title_ar||s.title_en):(s.title_en||s.title_ar)}</strong></div>
        <div>{lang==='ar'?(s.instructions_ar||s.instructions_en):(s.instructions_en||s.instructions_ar)}</div>
        <small>
         {s.task_type||'inspection'} · {s.response_type||'pass_fail'}
         {s.unit?` · ${s.unit}`:''}
         {s.min_value!=null||s.max_value!=null?` · ${s.min_value??'—'} → ${s.max_value??'—'}`:''}
        </small>
        {s.safety_notes&&<div><small><b>{lang==='ar'?'السلامة':'Safety'}:</b> {s.safety_notes}</small></div>}
        {s.tools&&<div><small><b>{lang==='ar'?'الأدوات':'Tools'}:</b> {s.tools}</small></div>}
        {s.materials&&<div><small><b>{lang==='ar'?'المواد':'Materials'}:</b> {s.materials}</small></div>}
        {s.acceptance_text&&<div><small><b>{lang==='ar'?'معيار القبول':'Acceptance'}:</b> {s.acceptance_text}</small></div>}
       </li>)}
      </ol>:<p style={{marginTop:6}}>{lang==='ar'?'لا توجد خطوات مرتبطة بهذا القالب في مصدر الخطوات الحالي.':'No steps are linked to this template in the current steps source.'}</p>}
     </div>
    </div>
   })}
  </div>

  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
   <button type="button" className="btn primary"
    onClick={()=>onRegister?.({
      type:selection.type,
      manufacturer:selection.manufacturer,
      option:selectedModel,
      model:selectedModel?.model_family||selectedModel?.model||''
    })}>
    {lang==='ar'?'تسجيل جهاز بهذا الاختيار':'Register device with this selection'}
   </button>
  </div>
 </div>
}
