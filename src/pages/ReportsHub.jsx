import {useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import ManagementReports from './ManagementReports'
import OwnerReports from './OwnerReports'

export default function ReportsHub(){
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const [tab,setTab]=useState('management')

 return <section className="facility-module">
  <style>{`
   .medical-reports-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
   .medical-reports-tabs button{border:1px solid #d7e0ea;background:#fff;border-radius:10px;padding:10px 16px;font-weight:700;cursor:pointer}
   .medical-reports-tabs button.active{background:#0b2b4b;color:#fff;border-color:#0b2b4b}
   .medical-reports-head{margin-bottom:14px}
   .medical-reports-head h1{margin:0;color:#0b2b4b}
   .medical-reports-head p{margin:5px 0 0;color:#64748b}
   @media print{.medical-reports-tabs,.medical-reports-head{display:none!important}}
  `}</style>

  <div className="medical-reports-head">
   <h1>{ar?'مركز التقارير':'Reports Center'}</h1>
   <p>{ar?'التقارير التشغيلية وتقارير المالك للأجهزة الطبية في مديول واحد.':'Operational and medical owner reports in one module.'}</p>
  </div>

  <div className="medical-reports-tabs no-print">
   <button className={tab==='management'?'active':''} onClick={()=>setTab('management')}>
    {ar?'التقارير التشغيلية والإدارية':'Management & Operational Reports'}
   </button>
   <button className={tab==='owner'?'active':''} onClick={()=>setTab('owner')}>
    {ar?'تقارير المالك للأجهزة الطبية':'Medical Owner Reports'}
   </button>
  </div>

  {tab==='management'?<ManagementReports/>:<OwnerReports/>}
 </section>
}
