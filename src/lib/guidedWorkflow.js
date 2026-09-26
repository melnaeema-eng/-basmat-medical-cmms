const KEY='basmat.guided.workflow.v2'

const now=()=>new Date().toISOString()

export function getGuidedWorkflow(){
 try{return JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return null}
}

export function saveGuidedWorkflow(value){
 if(!value){sessionStorage.removeItem(KEY);window.dispatchEvent(new CustomEvent('basmat-guided-workflow'));return null}
 const next={...value,updatedAt:now()}
 sessionStorage.setItem(KEY,JSON.stringify(next))
 window.dispatchEvent(new CustomEvent('basmat-guided-workflow',{detail:next}))
 return next
}

export function startGuidedWorkflow(value){
 return saveGuidedWorkflow({
  id:value.id||crypto.randomUUID?.()||String(Date.now()),
  type:value.type||'guided',
  title:value.title||'Guided Workflow',
  originPath:value.originPath||location.pathname,
  returnPath:value.returnPath||location.pathname,
  prerequisitePath:value.prerequisitePath||null,
  prerequisiteLabel:value.prerequisiteLabel||null,
  mode:value.mode||'active',
  current:value.current||0,
  steps:value.steps||[],
  snapshot:value.snapshot||{},
  context:value.context||{},
  createdAt:now()
 })
}

export function patchGuidedWorkflow(patch){
 const current=getGuidedWorkflow()||{}
 return saveGuidedWorkflow({...current,...patch})
}

export function finishGuidedWorkflow(){
 sessionStorage.removeItem(KEY)
 window.dispatchEvent(new CustomEvent('basmat-guided-workflow'))
}

export function guidedProgress(flow){
 const total=Math.max(1,flow?.steps?.length||0)
 const current=Math.min(total,Math.max(0,(flow?.current||0)+1))
 return {current,total,percent:Math.round(current/total*100)}
}
