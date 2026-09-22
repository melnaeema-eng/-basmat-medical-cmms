import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {loadSecurityReadiness} from '../lib/securityReadiness'

const labels={
 rls:{ar:'تفعيل سياسات RLS على جداول النظام',en:'RLS coverage on system tables'},
 security_definer_search_path:{ar:'تقوية مسار SECURITY DEFINER',en:'SECURITY DEFINER search_path hardening'},
 anon_function_execute:{ar:'منع تنفيذ الدوال لمستخدم anon',en:'Anonymous function execution'},
 anon_table_write:{ar:'منع الكتابة المباشرة لمستخدم anon',en:'Anonymous table write access'},
 orphan_roles:{ar:'سلامة ربط المستخدمين بالأدوار',en:'User-role membership integrity'},
 inactive_memberships:{ar:'عضويات المستخدمين غير النشطين',en:'Inactive user memberships'},
 duplicate_permissions:{ar:'عدم تكرار أكواد الصلاحيات',en:'Permission-code uniqueness'},
 migration_state:{ar:'حالة ترحيلات قاعدة البيانات',en:'Database migration state'}
}

function statusText(status,lang){
 if(lang==='ar') return status==='pass'?'ناجح':status==='warn'?'تحذير':'يحتاج معالجة'
 return status==='pass'?'Pass':status==='warn'?'Warning':'Needs action'
}

function detailSummary(c,lang){
 const d=c?.detail
 if(!d) return lang==='ar'?'لا توجد ملاحظات':'No issues'
 if(Array.isArray(d)) return d.length===0?(lang==='ar'?'لا توجد ملاحظات':'No issues'):(lang==='ar'?`${d.length} ملاحظة`:`${d.length} item(s)`)
 if(typeof d==='object'){
   if('total' in d && 'enabled' in d) return lang==='ar'?`${d.enabled} من ${d.total} جدول مفعّل`:`${d.enabled} of ${d.total} tables enabled`
   if('latest' in d) return lang==='ar'?`آخر إصدار قاعدة بيانات: ${d.latest}`:`Latest migration: ${d.latest}`
   return lang==='ar'?'تفاصيل إضافية متاحة':'Additional details available'
 }
 return String(d)
}

function humanizeKey(k,lang){
 const ar={
  proname:'اسم الدالة',
  arguments:'المعاملات',
  table_name:'اسم الجدول',
  privilege_type:'نوع الصلاحية',
  user_id:'المستخدم',
  organization_id:'المنظمة',
  role_id:'الدور',
  role_code:'رمز الدور',
  code:'الكود',
  qty:'العدد',
  total:'إجمالي الجداول',
  enabled:'RLS مفعّل',
  disabled:'RLS غير مفعّل',
  latest:'آخر Migration',
  applied:'عدد الـ Migrations'
 }
 if(lang==='ar') return ar[k]||k
 return k.replaceAll('_',' ')
}

function humanizeValue(v,lang){
 if(v===null || v===undefined || v==='') return lang==='ar'?'—':'—'
 if(typeof v==='boolean') return v?(lang==='ar'?'نعم':'Yes'):(lang==='ar'?'لا':'No')
 return String(v)
}

function DetailsView({detail,lang}){
 if(detail===null || detail===undefined) return <p className="security-empty-detail">{lang==='ar'?'لا توجد تفاصيل':'No details'}</p>

 if(Array.isArray(detail)){
   if(detail.length===0) return <p className="security-empty-detail">{lang==='ar'?'لا توجد ملاحظات':'No issues found'}</p>

   const objects=detail.filter(x=>x && typeof x==='object' && !Array.isArray(x))
   if(objects.length===detail.length){
     const keys=[...new Set(objects.flatMap(o=>Object.keys(o)))]
     return <div className="security-detail-table-wrap"><table className="security-detail-table">
      <thead><tr>{keys.map(k=><th key={k}>{humanizeKey(k,lang)}</th>)}</tr></thead>
      <tbody>{objects.map((o,i)=><tr key={i}>{keys.map(k=><td key={k}>{humanizeValue(o[k],lang)}</td>)}</tr>)}</tbody>
     </table></div>
   }

   return <ul className="security-detail-list">{detail.map((x,i)=><li key={i}>{humanizeValue(x,lang)}</li>)}</ul>
 }

 if(typeof detail==='object'){
   return <div className="security-detail-kv">
    {Object.entries(detail).map(([k,v])=><div key={k}>
      <span>{humanizeKey(k,lang)}</span>
      <strong>{humanizeValue(v,lang)}</strong>
    </div>)}
   </div>
 }

 return <p>{String(detail)}</p>
}

export default function SecurityReadiness(){
 const {t,lang}=useLanguage()
 const [data,setData]=useState({checks:[],summary:{},production_checklist:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=async()=>{setBusy(true);setError('');try{setData(await loadSecurityReadiness())}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{load()},[])
 const s=data.summary||{}
 const total=(Number(s.pass)||0)+(Number(s.warn)||0)+(Number(s.fail)||0)
 const score=total?Math.round(((Number(s.pass)||0)/total)*100):0
 const overall=Number(s.fail)>0?'fail':Number(s.warn)>0?'warn':'pass'
 const checks=useMemo(()=>data.checks||[],[data.checks])

 return <section className="facility-module security-readiness-page">
  <div className="page-head">
   <div>
    <h1>{t('securityReadinessTitle')}</h1>
    <p className="muted">{lang==='ar'?'ملخص واضح لجاهزية النظام قبل الإنتاج':'A clear production-readiness security summary'}</p>
   </div>
   <button className="btn secondary" onClick={load} disabled={busy}>{busy?'…':t('secRefresh')}</button>
  </div>

  {error&&<div className="facility-panel" role="alert">{error}</div>}

  <div className={`facility-panel security-hero status-${overall}`}>
   <div>
    <span className="security-kicker">{lang==='ar'?'نتيجة الجاهزية':'Readiness score'}</span>
    <strong className="security-score">{score}%</strong>
    <span className={`security-pill ${overall}`}>{statusText(overall,lang)}</span>
   </div>
   <div className="security-mini-grid">
    <div><span>{t('secPass')}</span><strong>{s.pass??0}</strong></div>
    <div><span>{t('secWarn')}</span><strong>{s.warn??0}</strong></div>
    <div><span>{t('secFail')}</span><strong>{s.fail??0}</strong></div>
   </div>
  </div>

  <div className="facility-panel">
   <div className="section-title-row"><h2>{t('secChecks')}</h2><span className="muted">{checks.length}</span></div>
   <div className="security-check-list">
    {checks.map(c=><article className="security-check-card" key={c.key}>
      <div className="security-check-main">
       <span className={`security-dot ${c.status}`}></span>
       <div>
        <strong>{labels[c.key]?.[lang]||c.label}</strong>
        <p>{detailSummary(c,lang)}</p>
       </div>
      </div>
      <div className="security-check-actions">
       <span className={`security-pill ${c.status}`}>{statusText(c.status,lang)}</span>
       <details className="security-human-details">
        <summary>{lang==='ar'?'عرض التفاصيل':'View details'}</summary>
        <DetailsView detail={c.detail} lang={lang}/>
       </details>
      </div>
    </article>)}
   </div>
  </div>

  <div className="facility-panel">
   <h2>{t('secChecklist')}</h2>
   <div className="security-checklist-grid">
    {(data.production_checklist||[]).map((x,i)=><div className="security-checklist-item" key={x}>
      <span>{i+1}</span><p>{x}</p>
    </div>)}
   </div>
  </div>
 </section>
}
