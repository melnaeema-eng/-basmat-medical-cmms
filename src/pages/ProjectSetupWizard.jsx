import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'

async function rows(table, columns='*'){
  const {data,error}=await supabase.from(table).select(columns).limit(5000)
  if(error) throw error
  return data||[]
}
async function optionalRows(table, columns='*'){
  try{return await rows(table,columns)}catch{return []}
}

export default function ProjectSetupWizard(){
  const {lang}=useLanguage()
  const ar=lang==='ar'
  const [data,setData]=useState({orgs:[],clients:[],contracts:[],sites:[],projects:[],teams:[],assets:[]})
  const [org,setOrg]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=async()=>{
    setLoading(true);setError('')
    try{
      const [orgs,clients,contracts,sites,p35,p0,teams,assets]=await Promise.all([
        rows('bf_organizations','id,name,code,status,organization_type'),
        rows('bf_clients','id,organization_id,name,code,status'),
        rows('bf_contracts','id,organization_id,client_id,contract_number,status'),
        rows('bf_sites','id,organization_id,client_id,name,code,status'),
        optionalRows('bf35_projects','id,organization_id,client_id,contract_id,name,status'),
        optionalRows('bf_projects','id,organization_id,client_id,contract_id,name,status'),
        optionalRows('bf35_teams','id,organization_id,project_id,name'),
        rows('bf_assets','id,organization_id,client_id,site_id,asset_tag,status')
      ])
      const projects=p35.length?p35:p0
      setData({orgs,clients,contracts,sites,projects,teams,assets})
      if(!org&&orgs.length)setOrg(orgs[0].id)
    }catch(e){setError(e.message)} finally{setLoading(false)}
  }

  useEffect(()=>{load()},[])
  const selected=data.orgs.find(x=>x.id===org)
  const scoped=useMemo(()=>({
    clients:data.clients.filter(x=>x.organization_id===org&&x.status!=='archived'),
    contracts:data.contracts.filter(x=>x.organization_id===org&&x.status!=='archived'),
    sites:data.sites.filter(x=>x.organization_id===org&&x.status!=='archived'),
    projects:data.projects.filter(x=>x.organization_id===org),
    teams:data.teams.filter(x=>x.organization_id===org || data.projects.some(p=>p.organization_id===org&&p.id===x.project_id)),
    assets:data.assets.filter(x=>x.organization_id===org&&x.status!=='archived')
  }),[data,org])

  const steps=[
    {key:'owner',labelAr:'1. المالك / المنظمة',labelEn:'1. Owner / Organization',done:!!selected,to:'/organizations',noteAr:'أنشئ المالك أو اختره من المنظمات الموجودة.',noteEn:'Create or select the owner organization.'},
    {key:'contractor',labelAr:'2. شركة الصيانة / العميل',labelEn:'2. Maintenance Company / Client',done:scoped.clients.length>0,to:'/clients',noteAr:'اختر شركة صيانة موجودة أو أنشئ الربط المطلوب للمشروع.',noteEn:'Select an existing maintenance company/client or create the required project relationship.'},
    {key:'project',labelAr:'3. المشروع',labelEn:'3. Project',done:scoped.projects.length>0,to:'/enterprise-structure',noteAr:'أنشئ المشروع وحدد المالك وشركة الصيانة.',noteEn:'Create the project and define owner and contractor.'},
    {key:'contract',labelAr:'4. العقد',labelEn:'4. Contract',done:scoped.contracts.length>0,to:'/contracts',noteAr:'أدخل العقد ونطاق الخدمة ومدة التنفيذ وSLA.',noteEn:'Enter contract, service scope, dates and SLA.'},
    {key:'sites',labelAr:'5. المرافق والمواقع',labelEn:'5. Facilities & Sites',done:scoped.sites.length>0,to:'/sites',noteAr:'أضف جميع مواقع وفروع المشروع.',noteEn:'Add all project facilities and branches.'},
    {key:'locations',labelAr:'6. الهيكل المكاني',labelEn:'6. Location Structure',done:scoped.sites.length>0,to:'/locations',noteAr:'المباني والطوابق والمناطق والغرف حسب الحاجة.',noteEn:'Buildings, floors, zones and rooms as required.'},
    {key:'people',labelAr:'7. الهيكل الإداري والصلاحيات',labelEn:'7. People & Access',done:scoped.teams.length>0,to:'/users',noteAr:'ممثل المالك، مدير المشروع، المدير، المشرف، المهندس والفني.',noteEn:'Owner representative, project manager, supervisors, engineers and technicians.'},
    {key:'teams',labelAr:'8. فرق التشغيل والإسناد',labelEn:'8. Teams & Assignment',done:scoped.teams.length>0,to:'/enterprise-structure',noteAr:'اربط الفرق بالمشروع والمواقع والتخصصات.',noteEn:'Assign teams to project, sites and disciplines.'},
    {key:'assets',labelAr:'9. الأصول وجاهزية التشغيل',labelEn:'9. Assets & Operational Readiness',done:scoped.assets.length>0,to:'/assets',noteAr:'سجل الأصول ثم ابدأ PPM وأوامر العمل.',noteEn:'Register assets then start PPM and work orders.'}
  ]
  const done=steps.filter(x=>x.done).length
  const pct=Math.round(done/steps.length*100)
  const next=steps.find(x=>!x.done)

  return <section className="facility-module" dir={ar?'rtl':'ltr'}>
    <div className="page-head"><div><h1>{ar?'معالج إعداد المشروع':'Project Setup Wizard'}</h1><p className="muted">{ar?'اتبع الخطوات بالترتيب حتى يصبح المشروع جاهزًا للتشغيل.':'Follow the sequence until the project is operationally ready.'}</p></div><button className="btn secondary" onClick={load}>{ar?'تحديث':'Refresh'}</button></div>
    {error&&<div className="alert error">{error}</div>}
    <div className="facility-panel">
      <div className="form-grid"><label>{ar?'المالك / المنظمة الحالية':'Current owner / organization'}<select value={org} onChange={e=>setOrg(e.target.value)}><option value="">{ar?'اختر':'Select'}</option>{data.orgs.filter(x=>x.status!=='archived').map(x=><option value={x.id} key={x.id}>{x.name||x.code}</option>)}</select></label><div><b>{ar?'تقدم الإعداد':'Setup progress'}</b><div style={{fontSize:34,fontWeight:800,marginTop:6}}>{pct}%</div><small>{done} / {steps.length}</small></div></div>
      <div style={{height:10,background:'#e6edf5',borderRadius:99,overflow:'hidden',marginTop:12}}><div style={{width:pct+'%',height:'100%',background:'#163b67',transition:'width .2s'}}/></div>
      {next&&<div className="alert" style={{marginTop:14}}><b>{ar?'الخطوة التالية: ':'Next step: '}{ar?next.labelAr:next.labelEn}</b><div>{ar?next.noteAr:next.noteEn}</div><Link className="btn primary" style={{display:'inline-block',marginTop:10}} to={next.to}>{ar?'متابعة الإعداد':'Continue setup'}</Link></div>}
      {!next&&<div className="alert success" style={{marginTop:14}}>{ar?'الإعداد الأساسي مكتمل. يمكنك الانتقال للتشغيل.':'Core setup is complete. You can move to operations.'}</div>}
    </div>
    <div className="security-check-list">{steps.map(s=><article className="facility-panel" key={s.key} style={{borderInlineStart:`5px solid ${s.done?'#20b26b':'#d9a514'}`}}><div className="page-head"><div><strong>{ar?s.labelAr:s.labelEn}</strong><p className="muted">{ar?s.noteAr:s.noteEn}</p></div><div className="row-actions"><span className={s.done?'badge success':'badge'}>{s.done?(ar?'مكتمل':'Done'):(ar?'مطلوب':'Required')}</span><Link className="btn secondary" to={s.to}>{ar?'فتح':'Open'}</Link></div></div></article>)}</div>
    </section>
}
