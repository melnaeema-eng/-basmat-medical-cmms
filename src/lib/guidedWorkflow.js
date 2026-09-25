const KEY='basmat.guided.workflow.v1'

function read(){
 try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}
}
function write(v){
 if(!v)sessionStorage.removeItem(KEY)
 else sessionStorage.setItem(KEY,JSON.stringify({...v,updated_at:new Date().toISOString()}))
 window.dispatchEvent(new CustomEvent('basmat-guided-workflow',{detail:v}))
 return v
}

export function getGuidedWorkflow(){return read()}

export function startGuidedWorkflow({type,title,steps=[],returnPath='',context={}}){
 const workflow={
  id:`${type||'workflow'}-${Date.now()}`,
  type:type||'workflow',
  title:title||type||'Workflow',
  steps:steps.map((x,i)=>typeof x==='string'?{id:x,label:x,done:false,order:i}:{done:false,order:i,...x}),
  current:0,
  returnPath,
  context,
  started_at:new Date().toISOString()
 }
 return write(workflow)
}

export function updateGuidedWorkflow(patch){
 const w=read()
 if(!w)return null
 return write({...w,...patch})
}

export function completeGuidedStep(stepId,extraContext={}){
 const w=read()
 if(!w)return null
 const steps=(w.steps||[]).map(s=>s.id===stepId?{...s,done:true}:s)
 let current=steps.findIndex(s=>!s.done)
 if(current<0)current=steps.length
 return write({...w,steps,current,context:{...(w.context||{}),...extraContext}})
}

export function requireGuidedModule({stepId,path,returnPath,context={}}){
 const w=read()
 if(!w)return path
 const steps=(w.steps||[]).map(s=>s.id===stepId?{...s,active:true}:s)
 write({...w,steps,returnPath:returnPath||w.returnPath,context:{...(w.context||{}),...context}})
 const params=new URLSearchParams()
 params.set('guided','1')
 if(returnPath||w.returnPath)params.set('returnTo',returnPath||w.returnPath)
 return `${path}${path.includes('?')?'&':'?'}${params.toString()}`
}

export function resumeGuidedPath(fallback='/'){
 const w=read()
 return w?.returnPath||fallback
}

export function finishGuidedWorkflow(){
 const w=read()
 sessionStorage.removeItem(KEY)
 window.dispatchEvent(new CustomEvent('basmat-guided-workflow',{detail:null}))
 return w
}

export function cancelGuidedWorkflow(){return finishGuidedWorkflow()}

export function guidedProgress(w=read()){
 if(!w?.steps?.length)return {done:0,total:0,percent:0,current:null}
 const done=w.steps.filter(s=>s.done).length,total=w.steps.length
 return {done,total,percent:Math.round(done/total*100),current:w.steps.find(s=>!s.done)||null}
}