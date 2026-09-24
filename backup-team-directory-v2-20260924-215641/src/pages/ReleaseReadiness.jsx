import {useEffect,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadReleaseReadiness} from '../lib/releaseReadiness'

function stateText(status,lang){
 return lang==='ar'?(status==='pass'?'ناجح':'يحتاج معالجة'):(status==='pass'?'Pass':'Needs action')
}
function details(detail,lang){
 if(Array.isArray(detail)) return detail.length?detail.join('، '):(lang==='ar'?'لا توجد ملاحظات':'No issues')
 if(detail&&typeof detail==='object') return Object.entries(detail).map(([k,v])=>`${k}: ${v}`).join(' · ')
 return String(detail??'')
}
export default function ReleaseReadiness(){
 const {t,lang}=useLanguage()
 const [data,setData]=useState({checks:[],summary:{},release_manifest:{},uat_checklist:[],deployment_steps:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadReleaseReadiness())}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const s=data.summary||{}
 const total=(Number(s.pass)||0)+(Number(s.fail)||0)
 const score=total?Math.round((Number(s.pass)||0)/total*100):0
 return <section className="facility-module release-readiness-page">
  <div className="page-head">
   <div><h1>{t('releaseReadinessTitle')}</h1><p className="muted">{lang==='ar'?'آخر فحص قبل اعتماد النسخة الإنتاجية':'Final check before production acceptance'}</p></div>
   <button className="btn secondary" onClick={load} disabled={busy}>{busy?'…':t('relRefresh')}</button>
  </div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="facility-panel security-hero">
   <div><span className="security-kicker">{lang==='ar'?'جاهزية الإصدار':'Release readiness'}</span><strong className="security-score">{score}%</strong></div>
   <div className="security-mini-grid"><div><span>{t('relPass')}</span><strong>{s.pass??0}</strong></div><div><span>{t('relFail')}</span><strong>{s.fail??0}</strong></div></div>
  </div>
  <div className="facility-panel"><h2>{t('relChecks')}</h2><div className="security-check-list">{(data.checks||[]).map(c=><article className="security-check-card" key={c.key}><div className="security-check-main"><span className={`security-dot ${c.status}`}></span><div><strong>{c.label}</strong><p>{details(c.detail,lang)}</p></div></div><span className={`security-pill ${c.status}`}>{stateText(c.status,lang)}</span></article>)}</div></div>
  <div className="facility-panel"><h2>{t('relUat')}</h2><div className="security-checklist-grid">{(data.uat_checklist||[]).map((x,i)=><div className="security-checklist-item" key={x}><span>{i+1}</span><p>{x}</p></div>)}</div></div>
  <div className="facility-panel"><h2>{t('relDeploy')}</h2><div className="security-checklist-grid">{(data.deployment_steps||[]).map((x,i)=><div className="security-checklist-item" key={x}><span>{i+1}</span><p>{x}</p></div>)}</div></div>
 </section>
}
