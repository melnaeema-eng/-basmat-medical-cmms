import {useEffect,useRef,useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadNotifications,setNotificationRead} from '../lib/notifications'
import './NotificationBell.css'
const kinds={approval_pending:'notificationApprovalPending',approval_rejected:'notificationApprovalRejected',approval_decided:'notificationApprovalDecided',sla_breached:'notificationSlaBreached',work_order_assigned:'notificationWorkAssigned',work_order_on_hold:'notificationWorkHold',work_order_due:'notificationWorkDue',ppm_due:'notificationPpmDue',ppm_overdue:'notificationPpmOverdue'}
export default function NotificationBell(){
 const {lang,t}=useLanguage(),ar=lang==='ar',navigate=useNavigate(),location=useLocation()
 const [open,setOpen]=useState(false),[data,setData]=useState({items:[],unread:0}),[busy,setBusy]=useState(false),[error,setError]=useState(false)
 const root=useRef(null),trigger=useRef(null),request=useRef(0)
 async function refresh(){const ticket=++request.current;setBusy(true);setError(false);try{const result=await loadNotifications(false,8,0);if(ticket===request.current)setData(result||{items:[],unread:0})}catch{if(ticket===request.current)setError(true)}finally{if(ticket===request.current)setBusy(false)}}
 useEffect(()=>{refresh();return()=>{request.current++}},[])
 useEffect(()=>{setOpen(false)},[location.pathname])
 useEffect(()=>{if(!open)return;const outside=e=>{if(!root.current?.contains(e.target))setOpen(false)};const key=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)}},[open])
 async function openItem(item){
  if(!item.is_read)try{await setNotificationRead(item.notification_key,true);setData(old=>({...old,unread:Math.max(0,(old.unread||0)-1),items:old.items.map(x=>x.notification_key===item.notification_key?{...x,is_read:true}:x)}))}catch{/* Opening the authorized record remains available if marking read fails. */}
  setOpen(false);const url=item.action_url;navigate(typeof url==='string'&&url.startsWith('/')&&!url.startsWith('//')?url:'/notifications')
 }
 return <div className="notification-bell" ref={root}>
  <button type="button" className="bafm-bell" ref={trigger} aria-label={(ar?'الإشعارات':'Notifications')+(data.unread?` (${data.unread})`:'')} aria-expanded={open} aria-haspopup="dialog" onClick={()=>{setOpen(v=>!v);if(!open)refresh()}}>
   <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3V9ZM10 21h4"/></svg>
   {data.unread>0&&<span className="notification-bell-count">{data.unread>99?'99+':data.unread}</span>}
  </button>
  {open&&<section className="notification-bell-panel" role="dialog" aria-label={ar?'الإشعارات الحديثة':'Recent notifications'}>
   <header><strong>{ar?'الإشعارات':'Notifications'}</strong><button type="button" aria-label={ar?'إغلاق':'Close'} onClick={()=>{setOpen(false);trigger.current?.focus()}}>×</button></header>
   {busy&&<p role="status">{ar?'جارٍ تحميل الإشعارات…':'Loading notifications…'}</p>}
   {error?<div role="alert"><p>{ar?'تعذر تحميل الإشعارات.':'Unable to load notifications.'}</p><button type="button" onClick={refresh}>{ar?'إعادة المحاولة':'Retry'}</button></div>:<ul>{!busy&&!data.items?.length&&<li className="notification-bell-empty">{t('notificationNoData')}</li>}{data.items?.map(item=><li key={item.notification_key}><button type="button" className={item.is_read?'':'is-unread'} onClick={()=>openItem(item)}><strong>{t(kinds[item.kind]||'notifications')}</strong><span>{item.title}</span><time>{item.occurred_at?new Date(item.occurred_at).toLocaleString(lang):''}</time>{!item.is_read&&<small>{t('notificationUnread')}</small>}</button></li>)}</ul>}
   <footer><button type="button" onClick={()=>{setOpen(false);navigate('/notifications')}}>{ar?'عرض كل الإشعارات':'View all notifications'}</button></footer>
  </section>}
 </div>
}
