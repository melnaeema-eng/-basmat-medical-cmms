import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {loadNotifications,setNotificationRead,markAllNotificationsRead} from '../lib/notifications'

const kinds={
 approval_pending:'notificationApprovalPending',approval_rejected:'notificationApprovalRejected',
 approval_decided:'notificationApprovalDecided',sla_breached:'notificationSlaBreached',
 work_order_assigned:'notificationWorkAssigned',work_order_on_hold:'notificationWorkHold',
 work_order_due:'notificationWorkDue',ppm_due:'notificationPpmDue',ppm_overdue:'notificationPpmOverdue'
}
const severities={critical:'notificationCritical',high:'notificationHigh',normal:'notificationNormal'}
export default function Notifications(){
 const {t,lang}=useLanguage()
 const [data,setData]=useState({items:[],unread:0,total:0,has_more:false}),[unreadOnly,setUnreadOnly]=useState(false)
 const [page,setPage]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async(nextUnread=unreadOnly,nextPage=page)=>{
  setBusy(true);setError('')
  try{setData(await loadNotifications(nextUnread,100,nextPage*100))}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 useEffect(()=>{load(false,0)},[])
 const changeUnread=v=>{setUnreadOnly(v);setPage(0);load(v,0)}
 const toggle=async item=>{
  setBusy(true);setError('')
  try{await setNotificationRead(item.notification_key,!item.is_read);await load(unreadOnly,page)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const markAll=async()=>{
  setBusy(true);setError('')
  try{await markAllNotificationsRead();await load(unreadOnly,0);setPage(0)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="facility-module">
  <div className="page-head">
   <div><h1>{t('notificationCenter')}</h1><p className="muted">{t('notificationLive')}</p></div>
   <div className="row-actions">
    <button className="btn secondary" disabled={busy} onClick={()=>load(unreadOnly,page)}>{t('notificationRefresh')}</button>
    <button className="btn primary" disabled={busy||!data.unread} onClick={markAll}>{t('notificationMarkAll')}</button>
   </div>
  </div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="facility-panel">
   <div className="row-actions">
    <button className={'btn '+(!unreadOnly?'primary':'secondary')} onClick={()=>changeUnread(false)}>{t('notificationAll')} ({data.total})</button>
    <button className={'btn '+(unreadOnly?'primary':'secondary')} onClick={()=>changeUnread(true)}>{t('notificationUnread')} ({data.unread})</button>
   </div>
  </div>
  {!data.items?.length&&!busy?<div className="facility-panel"><p>{t('notificationNoData')}</p></div>:
   data.items?.map(item=><article className="facility-panel" key={item.notification_key} style={{opacity:item.is_read?.78:1}}>
    <div className="page-head">
     <div>
      <strong>{t(kinds[item.kind]||item.kind)} — {item.title}</strong>
      <p className="muted">{new Date(item.occurred_at).toLocaleString(lang)}</p>
     </div>
     <span><strong>{t(severities[item.severity]||'notificationNormal')}</strong>{item.is_read?' ✓':''}</span>
    </div>
    {item.body&&<p>{item.body}</p>}
    <div className="row-actions">
     <button className="btn secondary" type="button" disabled={busy} onClick={()=>toggle(item)}>{item.is_read?t('notificationMarkUnread'):t('notificationMarkRead')}</button>
     <Link className="btn primary" to={item.action_url} onClick={()=>{if(!item.is_read)setNotificationRead(item.notification_key,true).catch(()=>{})}}>{t('notificationOpen')}</Link>
    </div>
   </article>)}
  <div className="row-actions">
   <button className="btn secondary" disabled={busy||page===0} onClick={()=>{const p=page-1;setPage(p);load(unreadOnly,p)}}>‹</button>
   <span>{t('notificationPage')} {page+1}</span>
   <button className="btn secondary" disabled={busy||!data.has_more} onClick={()=>{const p=page+1;setPage(p);load(unreadOnly,p)}}>›</button>
  </div>
 </section>
}
