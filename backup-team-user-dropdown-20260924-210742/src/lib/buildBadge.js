import {BUILD_INFO} from '../generated/buildInfo'

function addBuildBadge(){
 if(document.getElementById('bafm-build-version'))return
 const el=document.createElement('div')
 el.id='bafm-build-version'
 el.setAttribute('title',`Branch: ${BUILD_INFO.branch}\nBuilt: ${BUILD_INFO.builtAt}`)
 el.textContent=`Build: ${BUILD_INFO.commit}`
 Object.assign(el.style,{
  position:'fixed',
  right:'12px',
  bottom:'10px',
  zIndex:'99999',
  padding:'5px 9px',
  borderRadius:'999px',
  background:'rgba(15,23,42,.88)',
  color:'#fff',
  fontFamily:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  fontSize:'11px',
  lineHeight:'1',
  boxShadow:'0 2px 8px rgba(0,0,0,.18)',
  pointerEvents:'none',
  opacity:'.88'
 })
 document.body.appendChild(el)
}
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',addBuildBadge,{once:true})
}else addBuildBadge()
