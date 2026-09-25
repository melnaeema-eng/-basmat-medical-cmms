import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {cancelGuidedWorkflow,getGuidedWorkflow,guidedProgress,resumeGuidedPath} from '../lib/guidedWorkflow'

export default function GuidedWorkflowBar(){
 const navigate=useNavigate()
 const [workflow,setWorkflow]=useState(()=>getGuidedWorkflow())
 useEffect(()=>{
  const sync=()=>setWorkflow(getGuidedWorkflow())
  window.addEventListener('basmat-guided-workflow',sync)
  window.addEventListener('storage',sync)
  return()=>{window.removeEventListener('basmat-guided-workflow',sync);window.removeEventListener('storage',sync)}
 },[])
 if(!workflow)return null
 const p=guidedProgress(workflow)
 return <div className="guided-workflow-bar" role="status">
  <div className="guided-workflow-copy">
   <strong>{workflow.title}</strong>
   <span>{p.current?.label||'Completed'} · {p.done}/{p.total}</span>
  </div>
  <div className="guided-workflow-progress"><i style={{width:`${p.percent}%`}}/></div>
  <div className="guided-workflow-actions">
   <button type="button" className="btn xs secondary" onClick={()=>navigate(resumeGuidedPath('/'))}>Continue / متابعة</button>
   <button type="button" className="btn xs danger-soft" onClick={()=>{cancelGuidedWorkflow();setWorkflow(null)}}>×</button>
  </div>
 </div>
}