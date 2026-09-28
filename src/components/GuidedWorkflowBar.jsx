import {useEffect,useMemo,useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {applySmartLanguage} from '../lib/smartLanguage'
import {
 getGuidedWorkflow,saveGuidedWorkflow,startGuidedWorkflow,
 patchGuidedWorkflow,finishGuidedWorkflow,guidedProgress
} from '../lib/guidedWorkflow'

const ROUTES={
 corrective:{
  test:p=>p==='/corrective'||p.startsWith('/corrective/'),
  title:'Corrective / Service Request',
  titleAr:'البلاغ / الصيانة التصحيحية',
  steps:[
   step('organization',['organization_id','organization'],/organization|المنظمة|الجهة/i,'/organizations'),
   step('client',['client_id','client','customer'],/client|customer|العميل/i,'/clients'),
   step('site',['site_id','site','facility'],/site|facility|الموقع|المرفق/i,'/sites'),
   step('asset',['asset_id','asset','equipment','device'],/asset|equipment|device|الأصل|الجهاز/i,'/assets',false),
   step('title',['title','subject'],/title|subject|العنوان|الموضوع/i,null),
   step('priority',['priority'],/priority|الأولوية/i,null,false),
   step('description',['description','details','notes'],/description|details|notes|الوصف|التفاصيل|الملاحظات/i,null,false)
  ]
 },
 ppm:{
  test:p=>p==='/ppm'||p.startsWith('/ppm/'),
  title:'Preventive Maintenance',
  titleAr:'الصيانة الوقائية PPM',
  steps:[
   step('organization',['organization_id','organization'],/organization|المنظمة/i,'/organizations'),
   step('asset',['asset_id','asset'],/asset|الأصل|الجهاز/i,'/assets'),
   step('procedure',['procedure_id','procedure'],/procedure|الإجراء|إجراء الصيانة/i,'/asset-library'),
   step('contract',['contract_id','contract'],/contract|العقد/i,'/contracts',false),
   step('start_date',['start_date','start'],/start date|تاريخ البداية/i,null),
   step('interval',['interval_count','interval'],/interval|الفاصل|التكرار/i,null,false)
  ]
 },
 enterprise:{
  test:p=>p==='/enterprise-structure'||p.startsWith('/enterprise-structure/'),
  title:'Project Setup',
  titleAr:'إعداد المشروع',
  steps:[
   step('organization',['organization_id','organization'],/organization|المنظمة/i,'/organizations'),
   step('client',['client_id','client'],/client|العميل/i,'/clients'),
   step('contract',['contract_id','contract'],/contract|العقد/i,'/contracts',false),
   step('project_name',['name','project_name'],/project name|اسم المشروع|الاسم/i,null),
   step('project',['project_id','project'],/project|المشروع/i,null),
   step('site',['site_id','site'],/site|الموقع/i,'/sites'),
   step('team_name',['team_name','name'],/team name|اسم الفريق|الفريق/i,null,false)
  ]
 },
 assets:{
  test:p=>p==='/assets'||p.startsWith('/assets/'),
  title:'Asset Registration',
  titleAr:'تسجيل الأصل',
  steps:[
   step('organization',['organization_id','organization'],/organization|المنظمة/i,'/organizations'),
   step('client',['client_id','client'],/client|العميل/i,'/clients'),
   step('site',['site_id','site'],/site|الموقع/i,'/sites'),
   step('category',['category_id','category'],/category|التصنيف/i,'/asset-categories'),
   step('name_ar',['name_ar'],/الاسم بالعربية/i,null,false),
   step('name_en',['name_en'],/english name|الاسم بالإنجليزية/i,null,false),
   step('manufacturer',['manufacturer','brand'],/manufacturer|brand|المصنع|البراند/i,'/asset-library',false),
   step('model',['model'],/model|الموديل/i,'/asset-library',false)
  ]
 }
}

function step(key,names,label,prerequisite,required=true){
 return {key,names,label,prerequisite,required}
}

function routeConfig(path){
 return Object.values(ROUTES).find(x=>x.test(path))||null
}

function visible(el){
 return !!el&&el.offsetParent!==null&&!el.disabled
}

function controls(root=document){
 return [...root.querySelectorAll('input:not([type=hidden]),select,textarea,[contenteditable="true"]')].filter(visible)
}

function fieldLabel(el){
 if(!el)return ''
 return (el.closest('label')?.innerText||el.getAttribute('aria-label')||'').trim()
}

function score(el,def){
 const key=((el.name||'')+' '+(el.id||'')+' '+(el.dataset?.field||'')+' '+(el.autocomplete||'')).toLowerCase()
 const label=fieldLabel(el)
 let s=0
 for(const n of def.names||[]){
  const q=String(n).toLowerCase()
  if(key===q)s+=12
  else if(key.includes(q))s+=7
 }
 if(def.label?.test(label))s+=8
 return s
}

function findControl(def,root=document){
 return controls(root).map(el=>[score(el,def),el]).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0])[0]?.[1]||null
}

function meaningfulOptions(el){
 if(!(el instanceof HTMLSelectElement))return 1
 return [...el.options].filter(o=>o.value&&o.value!=='null'&&!o.disabled).length
}

function valueOf(el){
 if(!el)return''
 if(el.isContentEditable)return el.textContent||''
 return el.value??''
}

function complete(el,def){
 if(!el)return !def.required
 if(!def.required)return true
 if(el instanceof HTMLSelectElement)return !!el.value
 if(el.type==='checkbox'||el.type==='radio')return !!el.checked
 return String(valueOf(el)).trim().length>0
}

function setNativeValue(el,value){
 if(!el||value==null)return
 if(el.isContentEditable){
  el.textContent=String(value)
  el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}))
  return
 }
 const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:
  el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype
 const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set
 try{setter?.call(el,String(value))}catch{el.value=String(value)}
 el.dispatchEvent(new Event('input',{bubbles:true}))
 el.dispatchEvent(new Event('change',{bubbles:true}))
}

function snapshotForm(config){
 const out={}
 for(const def of config.steps){
  const el=findControl(def)
  if(el)out[def.key]=valueOf(el)
 }
 return out
}

function restoreSnapshot(config,snapshot){
 if(!snapshot)return
 requestAnimationFrame(()=>{
  for(const def of config.steps){
   if(snapshot[def.key]==null||snapshot[def.key]==='')continue
   const el=findControl(def)
   if(el&&!valueOf(el))setNativeValue(el,snapshot[def.key])
  }
 })
}

function resolveSteps(config){
 return config.steps.map(def=>{
  const el=findControl(def)
  return {
   ...def,
   found:!!el,
   done:complete(el,def),
   label:fieldLabel(el)||def.key,
   emptyOptions:el instanceof HTMLSelectElement&&meaningfulOptions(el)===0,
   element:el
  }
 })
}

function findActiveForm(config){
 const found=config.steps.map(x=>findControl(x)).find(Boolean)
 return found?.closest('form')||null
}

function languageIsArabic(){
 return document.documentElement.lang==='ar'||document.documentElement.dir==='rtl'
}

function notifyFlow(){
 window.dispatchEvent(new CustomEvent('basmat-guided-refresh'))
}

export default function GuidedWorkflowBar(){
 const location=useLocation(),navigate=useNavigate()
 const [flow,setFlow]=useState(()=>getGuidedWorkflow())
 const [tick,setTick]=useState(0)
 const config=useMemo(()=>routeConfig(location.pathname),[location.pathname])

 useEffect(()=>{
  const update=()=>setFlow(getGuidedWorkflow())
  const refresh=()=>setTick(x=>x+1)
  window.addEventListener('basmat-guided-workflow',update)
  window.addEventListener('basmat-guided-refresh',refresh)
  return()=>{
   window.removeEventListener('basmat-guided-workflow',update)
   window.removeEventListener('basmat-guided-refresh',refresh)
  }
 },[])

 useEffect(()=>{
  if(!config)return
  const current=getGuidedWorkflow()
  if(current?.mode==='prerequisite'&&current.returnPath===location.pathname){
   patchGuidedWorkflow({mode:'active',prerequisitePath:null,prerequisiteLabel:null})
  }
  const f=getGuidedWorkflow()
  if(f?.returnPath===location.pathname&&f?.snapshot)restoreSnapshot(config,f.snapshot)

  const timer=setTimeout(()=>{
   const steps=resolveSteps(config)
   const first=steps.find(x=>x.found&&!x.done&&x.required)
   if(first?.element){
    applySmartLanguage(first.element,{signal:true})
    first.element.focus()
   }
   notifyFlow()
  },220)
  return()=>clearTimeout(timer)
 },[location.pathname,config])

 useEffect(()=>{
  if(!config)return
  const onChange=e=>{
   const active=resolveSteps(config)
   const index=active.findIndex(x=>x.element===e.target)
   if(index<0)return
   const next=active.slice(index+1).find(x=>x.found&&!x.done&&x.required)
   if(next?.element&&complete(e.target,active[index])){
    setTimeout(()=>{
     applySmartLanguage(next.element,{signal:true})
     next.element.focus()
    },40)
   }
   const f=getGuidedWorkflow()
   if(f?.returnPath===location.pathname){
    saveGuidedWorkflow({...f,snapshot:{...(f.snapshot||{}),...snapshotForm(config)}})
   }
   notifyFlow()
  }
  document.addEventListener('change',onChange,true)
  document.addEventListener('blur',onChange,true)
  return()=>{
   document.removeEventListener('change',onChange,true)
   document.removeEventListener('blur',onChange,true)
  }
 },[config,location.pathname])

 useEffect(()=>{
  if(!config)return
  const onSubmit=e=>{
   const form=findActiveForm(config)
   if(!form||e.target!==form)return
   const steps=resolveSteps(config)
   const missing=steps.find(x=>x.found&&!x.done&&x.required)
   if(missing){
    e.preventDefault()
    e.stopPropagation()
    applySmartLanguage(missing.element,{signal:true})
    missing.element.focus()
    missing.element.classList.add('smart-language-warning')
    return
   }
   const f=getGuidedWorkflow()
   if(f?.returnPath===location.pathname){
    patchGuidedWorkflow({snapshot:snapshotForm(config),current:steps.length-1})
   }
  }
  document.addEventListener('submit',onSubmit,true)
  return()=>document.removeEventListener('submit',onSubmit,true)
 },[config,location.pathname])

 useEffect(()=>{
  const f=getGuidedWorkflow()
  if(f?.mode!=='prerequisite'||!f.returnPath||location.pathname===f.returnPath)return
  const observer=new MutationObserver(()=>{
   const success=[...document.querySelectorAll('.alert.success,[role=status],.success')]
    .some(x=>visible(x)&&String(x.textContent||'').trim().length>0)
   if(success){
    setTimeout(()=>{
     patchGuidedWorkflow({mode:'active',prerequisitePath:null,prerequisiteLabel:null})
     navigate(f.returnPath)
    },650)
   }
  })
  observer.observe(document.body,{childList:true,subtree:true,characterData:true})
  return()=>observer.disconnect()
 },[location.pathname,navigate])

 if(!config&&!flow)return null

 const active=config?resolveSteps(config):[]
 const relevant=active.filter(x=>x.found)
 const firstMissing=relevant.find(x=>!x.done&&x.required)
 const percent=relevant.length?Math.round(relevant.filter(x=>x.done||!x.required).length/relevant.length*100):0
 const ar=languageIsArabic()
 const currentFlow=flow||getGuidedWorkflow()

 const start=()=>{
  if(!config)return
  const steps=resolveSteps(config)
  const snapshot=snapshotForm(config)
  startGuidedWorkflow({
   type:Object.keys(ROUTES).find(k=>ROUTES[k]===config)||'guided',
   title:ar?config.titleAr:config.title,
   originPath:location.pathname,
   returnPath:location.pathname,
   steps:steps.map(x=>({key:x.key,label:x.label,required:x.required})),
   snapshot
  })
  setFlow(getGuidedWorkflow())
  const first=steps.find(x=>x.found&&!x.done&&x.required)
  if(first?.element){
   applySmartLanguage(first.element,{signal:true})
   first.element.focus()
  }
 }

 const goPrerequisite=()=>{
  if(!config||!firstMissing?.prerequisite)return
  const f=getGuidedWorkflow()||startGuidedWorkflow({
   type:'guided',title:ar?config.titleAr:config.title,
   originPath:location.pathname,returnPath:location.pathname,
   snapshot:snapshotForm(config)
  })
  patchGuidedWorkflow({
   mode:'prerequisite',
   returnPath:location.pathname,
   prerequisitePath:firstMissing.prerequisite,
   prerequisiteLabel:firstMissing.label,
   snapshot:snapshotForm(config)
  })
  navigate(firstMissing.prerequisite)
 }

 const back=()=>{
  const f=getGuidedWorkflow()
  if(!f?.returnPath)return
  patchGuidedWorkflow({mode:'active',prerequisitePath:null,prerequisiteLabel:null})
  navigate(f.returnPath)
 }

 if(currentFlow?.mode==='prerequisite'&&location.pathname!==currentFlow.returnPath){
  return <div className="guided-workflow-bar">
   <div>
    <strong>{ar?'أنت في خطوة لازمة لإكمال العملية':'Required prerequisite step'}</strong>
    <small>{currentFlow.prerequisiteLabel||''}</small>
   </div>
   <button className="btn secondary" type="button" onClick={back}>
    {ar?'الرجوع للعملية':'Return to workflow'}
   </button>
  </div>
 }

 if(!config)return null

 return <div className="guided-workflow-bar">
  <div className="guided-workflow-main">
   <strong>{ar?config.titleAr:config.title}</strong>
   <span>{ar?'التقدم':'Progress'}: {percent}%</span>
   {firstMissing&&<small>{ar?'الخطوة التالية: ':'Next: '}{firstMissing.label}</small>}
  </div>
  <div className="row-actions">
   {!currentFlow&&<button className="btn primary" type="button" onClick={start}>{ar?'ابدأ الدليل':'Start guide'}</button>}
   {firstMissing?.prerequisite&&firstMissing.emptyOptions&&
    <button className="btn secondary" type="button" onClick={goPrerequisite}>
     {ar?'إنشاء المتطلب أولاً':'Create prerequisite'}
    </button>}
   {currentFlow&&<button className="btn secondary" type="button" onClick={()=>finishGuidedWorkflow()}>
    {ar?'إنهاء الدليل':'Close guide'}
   </button>}
  </div>
 </div>
}

