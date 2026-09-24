import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {supabase} from '../lib/supabaseClient'
import {useLanguage} from '../i18n/LanguageContext'

const safeCount=async(table,build)=>{
  let q=supabase.from(table).select('*',{count:'exact',head:true})
  if(build)q=build(q)
  const {count,error}=await q
  if(error)throw error
  return count||0
}

export default function ProjectSetupWizard(){
  const {lang}=useLanguage()
  const ar=lang==='ar'
  const navigate=useNavigate()
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  const [orgs,setOrgs]=useState([])
  const [org,setOrg]=useState('')
  const [projects,setProjects]=useState([])
  const [project,setProject]=useState('')
  const [summary,setSummary]=useState({
    clients:0,contracts:0,sites:0,assets:0,locations:0,teams:0,ppm:0
  })

  const load=async()=>{
    setBusy(true);setError('')
    try{
      const {data:o,error:oe}=await supabase.from('bf_organizations')
        .select('id,name,code,status').eq('status','active').order('name')
      if(oe)throw oe
      const active=o||[]
      setOrgs(active)
      const chosen=org||active[0]?.id||''
      if(chosen&&!org)setOrg(chosen)

      let p=[]
      if(chosen){
        const {data,error}=await supabase.rpc('bf35_structure',{p_org:chosen})
        if(error)throw error
        p=data?.projects||[]
      }
      setProjects(p)
      const selected=p.find(x=>x.id===project)?.id||p[0]?.id||''
      if(selected!==project)setProject(selected)

      if(!chosen){
        setSummary({clients:0,contracts:0,sites:0,assets:0,locations:0,teams:0,ppm:0})
        return
      }

      const selectedProject=p.find(x=>x.id===selected)
      const projectSites=selectedProject?.sites||[]
      const siteIds=projectSites.map(x=>x.id||x.site_id).filter(Boolean)

      const [clients,contracts,sites,assets,buildings,floors,zones,rooms,plans]=await Promise.all([
        safeCount('bf_clients',q=>q.eq('organization_id',chosen)),
        safeCount('bf_contracts',q=>q.eq('organization_id',chosen)),
        Promise.resolve(siteIds.length),
        safeCount('bf_assets',q=>siteIds.length?q.in('site_id',siteIds):q.eq('id','00000000-0000-0000-0000-000000000000')),
        safeCount('bf_buildings',q=>siteIds.length?q.in('site_id',siteIds):q.eq('id','00000000-0000-0000-0000-000000000000')).catch(()=>0),
        safeCount('bf_floors',q=>siteIds.length?q.in('site_id',siteIds):q.eq('id','00000000-0000-0000-0000-000000000000')).catch(()=>0),
        safeCount('bf_zones',q=>siteIds.length?q.in('site_id',siteIds):q.eq('id','00000000-0000-0000-0000-000000000000')).catch(()=>0),
        safeCount('bf_rooms',q=>siteIds.length?q.in('site_id',siteIds):q.eq('id','00000000-0000-0000-0000-000000000000')).catch(()=>0),
        safeCount('bf_ppm_plans',q=>q.eq('organization_id',chosen)).catch(()=>0),
      ])

      setSummary({
        clients,contracts,sites,assets,
        locations:buildings+floors+zones+rooms,
        teams:selectedProject?.teams?.length||0,
        ppm:plans
      })
    }catch(e){setError(e.message||String(e))}
    finally{setBusy(false)}
  }

  useEffect(()=>{load()},[org,project])

  const hasOrg=!!org
  const hasClient=summary.clients>0
  const hasProject=!!project
  const hasContract=summary.contracts>0
  const hasSite=summary.sites>0
  const hasLocation=summary.locations>0
  const hasAsset=summary.assets>0
  const hasTeam=summary.teams>0
  const hasPpm=summary.ppm>0

  const steps=useMemo(()=>[
    {n:1,key:'owner',done:hasOrg,to:'/organizations',
      ar:'المالك / المنظمة',en:'Owner / Organization',
      arHelp:'إنشاء أو اختيار الجهة المالكة للمشروع.',enHelp:'Create or select the project owner organization.'},
    {n:2,key:'client',done:hasClient,to:'/clients',
      ar:'شركة الصيانة',en:'Maintenance Company',
      arHelp:'اختيار شركة صيانة موجودة أو تسجيل شركة جديدة دون تكرار.',enHelp:'Select an existing maintenance company or add a new one without duplication.'},
    {n:3,key:'project',done:hasProject,to:'/enterprise-structure',
      ar:'المشروع',en:'Project',
      arHelp:'إنشاء المشروع وربطه بالمالك وشركة الصيانة.',enHelp:'Create the project and link owner and maintenance company.'},
    {n:4,key:'contract',done:hasContract,to:'/contracts',
      ar:'العقد',en:'Contract',
      arHelp:'إضافة العقد وربطه بالمشروع والجهات المعنية.',enHelp:'Add and link the contract to the project parties.'},
    {n:5,key:'sites',done:hasSite,to:'/sites',
      ar:'المواقع',en:'Sites',
      arHelp:'إضافة موقع أو عدة مواقع للمشروع ثم ربطها به.',enHelp:'Add one or more project sites and link them to the project.'},
    {n:6,key:'locations',done:hasLocation,to:'/locations',
      ar:'الهيكل المكاني',en:'Spatial Structure',
      arHelp:'المباني والطوابق والمناطق والغرف حسب الحاجة.',enHelp:'Buildings, floors, zones and rooms as required.'},
    {n:7,key:'assets',done:hasAsset,to:'/assets',
      ar:'الأصول',en:'Assets',
      arHelp:'إضافة أو استيراد الأصول وربطها بالموقع والمكان.',enHelp:'Add/import assets and connect them to site and location.'},
    {n:8,key:'team',done:hasTeam,to:'/enterprise-structure',
      ar:'فريق المشروع',en:'Project Team',
      arHelp:'إنشاء الفريق وإسناد المدير والمهندسين والمشرفين والفنيين.',enHelp:'Create project teams and assign managers, engineers, supervisors and technicians.'},
    {n:9,key:'ppm',done:hasPpm,to:'/ppm',
      ar:'خطة الصيانة الوقائية',en:'PPM Plan',
      arHelp:'ربط الأصول بإجراءات وخطط الصيانة الوقائية.',enHelp:'Connect assets to preventive maintenance procedures and plans.'},
  ],[hasOrg,hasClient,hasProject,hasContract,hasSite,hasLocation,hasAsset,hasTeam,hasPpm])

  const completed=steps.filter(x=>x.done).length
  const percent=Math.round(completed/steps.length*100)
  const next=steps.find(x=>!x.done)
  const ready=completed===steps.length

  const openStep=s=>{
    sessionStorage.setItem('bafm-project-setup-return','/project-setup')
    sessionStorage.setItem('bafm-project-setup-step',String(s.n))
    navigate(s.to+'?setup=1')
  }

  const orgName=orgs.find(x=>x.id===org)?.name||orgs.find(x=>x.id===org)?.code||'—'
  const projectRow=projects.find(x=>x.id===project)
  const projectName=projectRow?.name||projectRow?.project_name||projectRow?.code||'—'

  return <section className="facility-module">
    <div className="page-head">
      <div>
        <h1>{ar?'إعداد المشروع':'Project Setup'}</h1>
        <p className="muted">{ar
          ?'مسار احترافي من إنشاء المالك حتى جاهزية المشروع للتشغيل.'
          :'A guided professional path from owner creation to project readiness.'}</p>
      </div>
      <button className="btn secondary" onClick={load} disabled={busy}>{ar?'تحديث الحالة':'Refresh status'}</button>
    </div>

    {error&&<div className="alert error">{error}</div>}

    <div className="facility-panel" style={{padding:22}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14,alignItems:'end'}}>
        <label>{ar?'المنظمة المالكة':'Owner organization'}
          <select value={org} onChange={e=>{setOrg(e.target.value);setProject('')}}>
            <option value="">{ar?'اختر':'Select'}</option>
            {orgs.map(x=><option key={x.id} value={x.id}>{x.name||x.code}</option>)}
          </select>
        </label>
        <label>{ar?'المشروع الجاري إعداده':'Project being configured'}
          <select value={project} onChange={e=>setProject(e.target.value)} disabled={!projects.length}>
            <option value="">{ar?'اختر / أنشئ مشروعاً':'Select / create project'}</option>
            {projects.map(x=><option key={x.id} value={x.id}>{x.code?x.code+' — ':''}{x.name||x.project_name||x.id}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="facility-panel" style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div>
          <strong style={{fontSize:22}}>{ar?'جاهزية المشروع':'Project Readiness'}: {percent}%</strong>
          <div className="muted">{orgName} · {projectName}</div>
        </div>
        <div style={{minWidth:260,flex:'1',maxWidth:620,height:14,borderRadius:20,background:'#e7edf5',overflow:'hidden'}}>
          <div style={{height:'100%',width:percent+'%',background:'linear-gradient(90deg,#173f70,#d6a620)',transition:'width .25s'}}/>
        </div>
        <strong>{completed}/{steps.length}</strong>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
      {steps.map(s=><div className="facility-panel" key={s.key}
        style={{padding:18,border:s===next?'2px solid #d6a620':undefined,opacity:s.done?0.92:1}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <div style={{width:36,height:36,borderRadius:'50%',display:'grid',placeItems:'center',fontWeight:800,
              background:s.done?'#e3f5e8':'#eef3f9',color:s.done?'#1d7138':'#173f70'}}>
              {s.done?'✓':s.n}
            </div>
            <div>
              <strong>{ar?s.ar:s.en}</strong>
              <div className="muted" style={{fontSize:13}}>{ar?s.arHelp:s.enHelp}</div>
            </div>
          </div>
        </div>
        <div className="row-actions" style={{marginTop:14}}>
          <button className={'btn '+(s===next?'primary':'secondary')} onClick={()=>openStep(s)}>
            {s.done?(ar?'مراجعة':'Review'):(ar?'فتح الخطوة':'Open step')}
          </button>
        </div>
      </div>)}
    </div>

    <div className="facility-panel" style={{padding:22,marginTop:16}}>
      <h2>{ar?'ملخص المشروع':'Project Summary'}</h2>
      <div className="stat-grid">
        {[
          [ar?'شركة الصيانة':'Maintenance company',summary.clients],
          [ar?'العقود':'Contracts',summary.contracts],
          [ar?'المواقع':'Sites',summary.sites],
          [ar?'العناصر المكانية':'Locations',summary.locations],
          [ar?'الأصول':'Assets',summary.assets],
          [ar?'الفرق':'Teams',summary.teams],
          [ar?'خطط PPM':'PPM plans',summary.ppm],
        ].map(([label,val])=><div className="stat-card" key={label}><span>{label}</span><strong>{val}</strong></div>)}
      </div>
    </div>

    <div className="facility-panel" style={{padding:22,marginTop:16}}>
      {ready?
        <div className="alert success"><strong>{ar?'✓ المشروع جاهز للتشغيل':'✓ Project is ready for operations'}</strong></div>:
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <div>
            <strong>{ar?'الخطوة التالية':'Next step'}: {ar?next?.ar:next?.en}</strong>
            <p className="muted">{ar?next?.arHelp:next?.enHelp}</p>
          </div>
          {next&&<button className="btn primary" onClick={()=>openStep(next)}>
            {ar?'متابعة الإعداد ←':'Continue setup →'}
          </button>}
        </div>}
    </div>
  </section>
}
