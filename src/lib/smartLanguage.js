import {useEffect} from 'react'

const ARABIC_RE=/[\u0600-\u06FF]/
const LATIN_RE=/[A-Za-z]/
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const TEXT_SELECTOR='input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]),textarea,[contenteditable="true"]'
const TITLE_MARKER=/\s*\[BASMAT-KBD-(AR|EN)\]\s*/g

const textOf=el=>{
 if(el?.isContentEditable)return el.textContent||''
 return el?.value||''
}

const labelOf=el=>{
 const own=el?.closest?.('label')?.innerText||''
 if(own)return own
 const id=el?.id
 if(id){
  const label=document.querySelector(`label[for="${CSS.escape(id)}"]`)
  if(label?.innerText)return label.innerText
 }
 return ''
}

function isEmailField(el){
 if(!(el instanceof HTMLInputElement))return false
 const key=((el.type||'')+' '+(el.name||'')+' '+(el.id||'')+' '+(el.autocomplete||'')+' '+labelOf(el)).toLowerCase()
 return el.type==='email'||/\bemail\b|e-mail|البريد|بريد إلكتروني|البريد الإلكتروني/.test(key)
}

function declaredMode(el){
 if(isEmailField(el))return'en'
 const explicit=(el?.dataset?.langMode||el?.dataset?.lang||el?.getAttribute?.('lang')||'').toLowerCase()
 if(explicit==='ar'||explicit==='arabic')return'ar'
 if(explicit==='en'||explicit==='english')return'en'

 const key=((el?.name||'')+' '+(el?.id||'')+' '+(el?.getAttribute?.('data-field')||'')).toLowerCase()
 if(/(^|[_\-\s])(ar|arabic)($|[_\-\s])/.test(key)||/(name_ar|title_ar|description_ar|instructions_ar|notes_ar|address_ar)/.test(key))return'ar'
 if(/(^|[_\-\s])(en|english)($|[_\-\s])/.test(key)||/(name_en|title_en|description_en|instructions_en|notes_en|address_en)/.test(key))return'en'

 const label=labelOf(el)
 if(/العربية|عربي|باللغة العربية|الاسم بالعربية|الوصف بالعربية/.test(label))return'ar'
 if(/english|بالإنجليزية|الانجليزية|الإنجليزية|إنجليزي|انجليزي/i.test(label))return'en'
 return'auto'
}

function contentMode(value,fallback='auto'){
 const v=String(value||'')
 const ar=(v.match(/[\u0600-\u06FF]/g)||[]).length
 const en=(v.match(/[A-Za-z]/g)||[]).length
 if(ar>en)return'ar'
 if(en>ar)return'en'
 return fallback
}

function signalWindowsKeyboard(mode){
 if(mode!=='ar'&&mode!=='en')return
 const clean=(document.title||'').replace(TITLE_MARKER,'').trim()
 document.title=`${clean} [BASMAT-KBD-${mode.toUpperCase()}]`
 clearTimeout(window.__basmatKeyboardSignalTimer)
 window.__basmatKeyboardSignalTimer=setTimeout(()=>{
  document.title=(document.title||'').replace(TITLE_MARKER,'').trim()
 },900)
}

function setVisualDirection(el,mode,{signal=false}={}){
 const dir=mode==='ar'?'rtl':'ltr'
 const lang=mode==='ar'?'ar':'en'
 el.setAttribute('dir',dir)
 el.setAttribute('lang',lang)
 el.dataset.smartDirection=dir
 el.dataset.smartLanguage=lang
 if(el.style){
  el.style.direction=dir
  el.style.textAlign=mode==='ar'?'right':'left'
 }
 if(signal)signalWindowsKeyboard(mode)
}

function validateDeclaredLanguage(el,mode){
 if(mode==='auto'||isEmailField(el))return
 const v=textOf(el)
 const mismatch=mode==='ar'
  ? (LATIN_RE.test(v)&&!ARABIC_RE.test(v))
  : (ARABIC_RE.test(v)&&!LATIN_RE.test(v))
 el.classList.toggle('smart-language-warning',!!(v.trim()&&mismatch))
 el.setAttribute('aria-invalid',mismatch?'true':'false')
 el.title=mismatch
  ?(mode==='ar'?'هذا الحقل مخصص للكتابة بالعربية':'This field expects English')
  :''
}

function normalizeEmail(el,{trim=false}={}){
 if(!isEmailField(el))return
 let v=String(el.value||'')
 if(trim)v=v.trim()
 const lowered=v.toLowerCase()
 if(el.value!==lowered){
  const start=el.selectionStart,end=el.selectionEnd
  el.value=lowered
  try{if(document.activeElement===el&&start!=null&&end!=null)el.setSelectionRange(start,end)}catch{}
  el.dispatchEvent(new Event('input',{bubbles:true}))
 }
}

function validateEmail(el){
 if(!isEmailField(el))return true
 el.type='email'
 el.autocomplete=el.autocomplete||'email'
 el.inputMode='email'
 setVisualDirection(el,'en')

 const value=String(el.value||'').trim()
 const valid=!value||EMAIL_RE.test(value)
 const message=valid?'':'اكتب البريد بصيغة صحيحة مثل name@example.com'
 el.setCustomValidity(message)
 el.classList.toggle('smart-email-invalid',!valid)
 el.setAttribute('aria-invalid',valid?'false':'true')
 if(!valid)el.title=message
 else if(el.title===message)el.title=''
 return valid
}

export function applySmartLanguage(el,{signal=false}={}){
 if(!el?.matches?.(TEXT_SELECTOR))return
 const declared=declaredMode(el)
 const inherited=(document.documentElement?.dir==='rtl'?'ar':'en')
 const mode=declared==='auto'?contentMode(textOf(el),inherited):declared
 setVisualDirection(el,mode,{signal})
 validateDeclaredLanguage(el,declared)
 el.dataset.smartLanguageDeclared=declared
 if(isEmailField(el))validateEmail(el)
}

function refreshFromContent(el,{signal=false}={}){
 if(!el?.matches?.(TEXT_SELECTOR))return
 if(isEmailField(el)){
  setVisualDirection(el,'en',{signal})
  validateEmail(el)
  return
 }
 const declared=el.dataset.smartLanguageDeclared||declaredMode(el)
 if(declared==='auto'){
  const current=el.dataset.smartLanguage||((document.documentElement?.dir==='rtl')?'ar':'en')
  const mode=contentMode(textOf(el),current)
  const changed=mode!==el.dataset.smartLanguage
  setVisualDirection(el,mode,{signal:signal||changed})
 }else{
  setVisualDirection(el,declared,{signal})
  validateDeclaredLanguage(el,declared)
 }
}

function bind(el){
 if(!el?.matches?.(TEXT_SELECTOR))return
 applySmartLanguage(el)
 if(el.dataset.smartDirectionBound)return
 el.dataset.smartDirectionBound='1'

 if(isEmailField(el)){
  el.addEventListener('input',()=>{
   normalizeEmail(el)
   validateEmail(el)
  })
  el.addEventListener('blur',()=>{
   normalizeEmail(el,{trim:true})
   validateEmail(el)
  })
  el.addEventListener('change',()=>{
   normalizeEmail(el,{trim:true})
   validateEmail(el)
  })
  el.addEventListener('focus',()=>{
   setVisualDirection(el,'en',{signal:true})
   validateEmail(el)
  })
  return
 }

 el.addEventListener('input',()=>refreshFromContent(el))
 el.addEventListener('change',()=>refreshFromContent(el))
 el.addEventListener('focus',()=>refreshFromContent(el,{signal:true}))
}

function validateFormEmails(form){
 const emails=[...form.querySelectorAll('input')].filter(isEmailField)
 for(const el of emails){
  normalizeEmail(el,{trim:true})
  if(!validateEmail(el)){
   el.focus()
   try{el.reportValidity()}catch{}
   return false
  }
 }
 return true
}

export function focusNextField(current){
 const form=current?.closest?.('form')
 if(!form)return
 const items=[...form.querySelectorAll('input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[contenteditable="true"],button[type=submit]:not([disabled])')]
 const i=items.indexOf(current)
 const next=items.slice(i+1).find(x=>!x.readOnly&&x.offsetParent!==null)
 if(next)requestAnimationFrame(()=>{
  applySmartLanguage(next,{signal:true})
  next.focus()
 })
}

export function useSmartLanguageInputs(){
 useEffect(()=>{
  const scan=root=>root?.querySelectorAll?.(TEXT_SELECTOR).forEach(bind)
  scan(document)

  const focus=e=>bind(e.target)
  const submit=e=>{
   if(!(e.target instanceof HTMLFormElement))return
   if(!validateFormEmails(e.target)){
    e.preventDefault()
    e.stopPropagation()
   }
  }

  const observer=new MutationObserver(mutations=>{
   for(const mutation of mutations){
    for(const node of mutation.addedNodes){
     if(!(node instanceof Element))continue
     if(node.matches?.(TEXT_SELECTOR))bind(node)
     scan(node)
    }
   }
  })

  observer.observe(document.body,{childList:true,subtree:true})
  document.addEventListener('focusin',focus)
  document.addEventListener('submit',submit,true)

  return()=>{
   observer.disconnect()
   document.removeEventListener('focusin',focus)
   document.removeEventListener('submit',submit,true)
  }
 },[])
}
