import {useEffect} from 'react'

const hasArabic=s=>/[\u0600-\u06FF]/.test(s||'')
const hasLatin=s=>/[A-Za-z]/.test(s||'')

function fieldMode(el){
 const key=((el.name||'')+' '+(el.id||'')+' '+(el.getAttribute('data-field')||'')).toLowerCase()
 if(/(^|[_\-\s])(ar|arabic)($|[_\-\s])/.test(key)||/(name_ar|title_ar|instructions_ar|description_ar)/.test(key))return'ar'
 if(/(^|[_\-\s])(en|english)($|[_\-\s])/.test(key)||/(name_en|title_en|instructions_en|description_en)/.test(key))return'en'
 const label=el.closest('label')?.innerText||''
 if(/العربية|عربي/.test(label))return'ar'
 if(/english|الإنجليزية/i.test(label))return'en'
 return null
}

function apply(el){
 if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return
 const mode=fieldMode(el)
 if(!mode)return
 el.lang=mode
 el.dir=mode==='ar'?'rtl':'ltr'
 el.dataset.smartLanguage=mode
 const test=()=>{
  const v=el.value||''
  const mismatch=mode==='ar'?(hasLatin(v)&&!hasArabic(v)):(hasArabic(v)&&!hasLatin(v))
  el.classList.toggle('smart-language-warning',!!(v.trim()&&mismatch))
  el.title=mismatch?(mode==='ar'?'هذا الحقل مخصص للعربية':'This field expects English'):''
 }
 test()
 if(!el.dataset.smartLanguageBound){
  el.dataset.smartLanguageBound='1'
  el.addEventListener('input',test)
 }
}

export function focusNextField(current){
 const form=current?.closest('form')
 if(!form)return
 const items=[...form.querySelectorAll('input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),button[type=submit]:not([disabled])')]
 const i=items.indexOf(current)
 const next=items.slice(i+1).find(x=>!x.readOnly&&x.offsetParent!==null)
 if(next)requestAnimationFrame(()=>next.focus())
}

export function useSmartLanguageInputs(){
 useEffect(()=>{
  const scan=()=>document.querySelectorAll('input,textarea').forEach(apply)
  scan()
  const focus=e=>apply(e.target)
  const observer=new MutationObserver(scan)
  observer.observe(document.body,{childList:true,subtree:true})
  document.addEventListener('focusin',focus)
  return()=>{observer.disconnect();document.removeEventListener('focusin',focus)}
 },[])
}