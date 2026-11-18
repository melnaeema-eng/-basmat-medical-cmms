import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'

export default function AcceptInvitation(){
 const {lang}=useLanguage(),ar=lang==='ar',navigate=useNavigate()
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{
  let alive=true
  supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setLoading(false)}})
  const {data}=supabase.auth.onAuthStateChange((_event,value)=>{if(alive)setSession(value)})
  return()=>{alive=false;data.subscription.unsubscribe()}
 },[])
 async function save(e){e.preventDefault();if(!session||password.length<12||password!==confirm)return;setBusy(true);setError('')
  const {error}=await supabase.auth.updateUser({password})
  setBusy(false);if(error){setError(error.message);return}setPassword('');setConfirm('');navigate('/',{replace:true})
 }
 return <main className="facility-panel" style={{maxWidth:520,margin:'10vh auto',padding:28}}><h1>{ar?'قبول دعوة بصمة النوابغ':'Accept your Basmat invitation'}</h1>
 {error&&<p role="alert">{error}</p>}
 {loading?<p>{ar?'جارٍ التحقق من الدعوة…':'Checking invitation…'}</p>:!session?<p>{ar?'افتح رابط الدعوة المرسل إلى بريدك. إذا انتهت صلاحيته، اطلب من أدمن الشركة دعوة جديدة.':'Open the invitation link from your email. If it has expired, ask your company administrator for a new invitation.'}</p>:<form onSubmit={save} className="form-grid">
 <p>{ar?'عيّن كلمة مرور لحسابك، ثم افتح المشاريع المسندة إليك.':'Set your account password, then open your assigned projects.'}</p>
 <label>{ar?'كلمة مرور جديدة (12 حرفًا على الأقل)':'New password (at least 12 characters)'}<input type="password" minLength={12} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label>{ar?'تأكيد كلمة المرور':'Confirm password'}<input type="password" minLength={12} autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
 {confirm&&password!==confirm&&<p role="alert">{ar?'كلمتا المرور غير متطابقتين':'Passwords do not match'}</p>}
 <button className="btn primary" disabled={busy||password.length<12||password!==confirm}>{ar?'حفظ وفتح حسابي':'Save and open my account'}</button></form>}
 </main>
}
