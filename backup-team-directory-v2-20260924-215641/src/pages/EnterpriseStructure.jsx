import {useEffect,useMemo,useState} from 'react'
import {useLanguage} from '../i18n/LanguageContext'
import {supabase} from '../lib/supabaseClient'
import {
 loadEnterpriseStructure,seedServiceLines,createProject,linkProjectSite,createTeam,addTeamMember,loadStaffDirectory,
 loadHealthcareOwners,createManualHealthcareOwner,resolveCreatedProjectId,linkProjectOwner
} from '../lib/enterpriseStructure'

const normalizeOwnerSearch=value=>String(value||'')
 .toLowerCase()
 .replace(/[أإآٱ]/g,'ا')
 .replace(/ى/g,'ي')
 .replace(/ئ/g,'ي')
 .replace(/ؤ/g,'و')
 .replace(/ة/g,'ه')
 .replace(/ـ/g,'')
 .replace(/[\u064B-\u065F\u0670]/g,'')
 .replace(/[^a-z0-9\u0621-\u064A]+/g,' ')
 .trim()

export default function EnterpriseStructure(){
 const {t}=useLanguage()
 const [dir,setDir]=useState({orgs:[],clients:[],contracts:[],sites:[],roles:[],users:[]})
 const [org,setOrg]=useState(''),[data,setData]=useState({service_lines:[],projects:[],teams:[]})
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [owners,setOwners]=useState([])
 const [ownerSearch,setOwnerSearch]=useState('')
 const [project,setProject]=useState({client_id:'',contract_id:'',owner_id:'',name:'',start_date:'',end_date:''})
 const [showManualOwner,setShowManualOwner]=useState(false)
 const [manualOwner,setManualOwner]=useState({name_ar:'',name_en:'',owner_type:'company',ownership_sector:'private',region:'',city:''})
 const [link,setLink]=useState({project_id:'',site_id:''})
 const [team,setTeam]=useState({project_id:'',service_line_id:'',site_id:'',name:'',discipline_code:'',shift_code:''})
 const [member,setMember]=useState({team_id:'',user_id:'',role_id:'',member_type:'worker',is_lead:false})

 useEffect(()=>{Promise.all([
  supabase.from('bf_organizations').select('id,name').eq('status','active'),
  supabase.from('bf_clients').select('id,organization_id,name').eq('status','active'),
  supabase.from('bf_contracts').select('id,organization_id,client_id,contract_number,status'),
  supabase.from('bf_sites').select('id,organization_id,client_id,name').eq('status','active'),
  supabase.from('bf_roles').select('id,organization_id,name,code').order('name'),
  loadStaffDirectory(),
  loadHealthcareOwners()
 ]).then(rs=>{
  const x={orgs:rs[0].data||[],clients:rs[1].data||[],contracts:rs[2].data||[],sites:rs[3].data||[],roles:rs[4].data||[],users:rs[5]||[]}
  setDir(x);setOwners(rs[6]||[]);if(x.orgs[0])setOrg(x.orgs[0].id)
 }).catch(e=>setError(e.message))},[])

 const load=async(id=org)=>{if(!id)return;setBusy(true);setError('');try{setData(await loadEnterpriseStructure(id))}catch(e){setError(e.message)}finally{setBusy(false)}}
 useEffect(()=>{if(org)load(org)},[org])

 const clients=useMemo(()=>dir.clients.filter(x=>x.organization_id===org),[dir.clients,org])
 const contracts=useMemo(()=>dir.contracts.filter(x=>x.organization_id===org&&(!project.client_id||x.client_id===project.client_id)),[dir.contracts,org,project.client_id])
 const filteredOwners=useMemo(()=>{
  const q=normalizeOwnerSearch(ownerSearch)
  if(!q)return owners
  return owners.filter(x=>[x.name_ar,x.name_en,x.region,x.city,x.ownership_sector].some(v=>normalizeOwnerSearch(v).includes(q)))
 },[owners,ownerSearch])
 // RIYADH_FULL_OWNER_RESTORE_EFFECT
 useEffect(()=>{
  if(ownerSearch.trim())return
  let alive=true
  loadHealthcareOwners()
   .then(rows=>{
    if(!alive)return
    const sorted=[...(rows||[])].sort((a,b)=>{
     const ar=a.region==='Riyadh'?0:1
     const br=b.region==='Riyadh'?0:1
     if(ar!==br)return ar-br
     return String(a.city||'').localeCompare(String(b.city||''))||
            String(a.name_en||a.name_ar||'').localeCompare(String(b.name_en||b.name_ar||''))
    })
    setOwners(sorted)
   })
   .catch(e=>{if(alive)setError(e.message)})
  return()=>{alive=false}
 },[ownerSearch])

 const projectForTeam=data.projects.find(x=>x.id===team.project_id)
 const projectSites=projectForTeam?.sites||[]
 const roles=dir.roles.filter(x=>!x.organization_id||x.organization_id===org)
 const users=dir.users.filter(x=>x.organization_id===org)

 const run=async fn=>{setBusy(true);setError('');try{await fn();await load()}catch(e){setError(e.message)}finally{setBusy(false)}}

 const addManualOwner=async()=>{
  if(!manualOwner.name_ar.trim()&&!manualOwner.name_en.trim())throw Error('Enter the owner/company name | أدخل اسم المالك/الشركة')
  const created=await createManualHealthcareOwner(manualOwner)
  setOwners(v=>[created,...v])
  setProject(v=>({...v,owner_id:created.id}))
  setManualOwner({name_ar:'',name_en:'',owner_type:'company',ownership_sector:'private',region:'',city:''})
  setShowManualOwner(false)
 }

 const submitProject=e=>{e.preventDefault();run(async()=>{
  if(!project.owner_id)throw Error('Select project owner | اختر مالك المشروع')
  const created=await createProject({...project,organization_id:org})
  const projectId=await resolveCreatedProjectId(created,{...project,organization_id:org})
  await linkProjectOwner(projectId,project.owner_id)
  setProject({client_id:'',contract_id:'',owner_id:'',name:'',start_date:'',end_date:''})
  setOwnerSearch('')
 })}

 const submitLink=e=>{e.preventDefault();run(async()=>{await linkProjectSite(link.project_id,link.site_id);setLink({project_id:'',site_id:''})})}
 const submitTeam=e=>{e.preventDefault();run(async()=>{await createTeam(team);setTeam({project_id:'',service_line_id:'',site_id:'',name:'',discipline_code:'',shift_code:''})})}
 const submitMember=e=>{e.preventDefault();run(async()=>{await addTeamMember(member);setMember({team_id:'',user_id:'',role_id:'',member_type:'worker',is_lead:false})})}

 return <section className="facility-module">
  <div className="page-head"><h1>{t('enterpriseStructureTitle')}</h1><button className="btn secondary" onClick={()=>load()}>{t('esRefresh')}</button></div>
  {error&&<div className="facility-panel" role="alert">{error}</div>}
  <div className="facility-panel"><div className="form-grid"><label>{t('esOrg')}<select value={org} onChange={e=>setOrg(e.target.value)}>{dir.orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div><button className="btn secondary" onClick={()=>run(()=>seedServiceLines(org))}>{t('esSeed')}</button></div>

  <form className="facility-panel" onSubmit={submitProject}><h2>{t('esNewProject')}</h2><div className="form-grid">
   <label>{t('esClient')}<select required value={project.client_id} onChange={e=>setProject(v=>({...v,client_id:e.target.value,contract_id:''}))}><option value="">—</option>{clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('esContract')}<select value={project.contract_id} onChange={e=>setProject(v=>({...v,contract_id:e.target.value}))}><option value="">—</option>{contracts.map(x=><option key={x.id} value={x.id}>{x.contract_number}</option>)}</select></label>

   <label>Owner Search | بحث المالك
    <input value={ownerSearch} onChange={e=>setOwnerSearch(e.target.value)} placeholder="Hospital, center, city... | مستشفى، مركز، مدينة..."/>
   </label>

   <label>Project Owner | مالك المشروع
    <select required value={project.owner_id} onChange={e=>setProject(v=>({...v,owner_id:e.target.value}))}>
     <option value="">— Select Owner | اختر المالك —</option>
     {filteredOwners.map(x=>{
      const ar=String(x.name_ar||'').trim()
      const en=String(x.name_en||'').trim()
      const sameName=ar.toLowerCase()===en.toLowerCase()
      const names=sameName?(en||ar):[ar,en].filter(Boolean).join(' | ')
      const place=[x.city,x.region].filter(v=>v&&v!=='Unknown'&&v!=='—').join(' / ')
      return <option key={x.id} value={x.id}>{names}{place?' — '+place:''}</option>
     })}
    </select>
   </label>

   <label>{t('esName')}<input required value={project.name} onChange={e=>setProject(v=>({...v,name:e.target.value}))}/></label>
   <label>{t('esStart')}<input type="date" value={project.start_date} onChange={e=>setProject(v=>({...v,start_date:e.target.value}))}/></label>
   <label>{t('esEnd')}<input type="date" value={project.end_date} onChange={e=>setProject(v=>({...v,end_date:e.target.value}))}/></label>
  </div>

  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
   <button className="btn primary" disabled={busy}>{t('esCreate')}</button>
   <button type="button" className="btn secondary" onClick={()=>setShowManualOwner(v=>!v)}>＋ Add Owner / Company | إضافة مالك / شركة</button>
  </div>

  {showManualOwner&&<div className="facility-panel" style={{marginTop:12}}>
   <h3>Add Manual Owner / Company | إضافة مالك / شركة يدويًا</h3>
   <div className="form-grid">
    <label>Arabic Name | الاسم العربي<input value={manualOwner.name_ar} onChange={e=>setManualOwner(v=>({...v,name_ar:e.target.value}))}/></label>
    <label>English Name | الاسم الإنجليزي<input value={manualOwner.name_en} onChange={e=>setManualOwner(v=>({...v,name_en:e.target.value}))}/></label>
    <label>Type | النوع<select value={manualOwner.owner_type} onChange={e=>setManualOwner(v=>({...v,owner_type:e.target.value}))}>
     <option value="company">Company | شركة</option><option value="hospital">Hospital | مستشفى</option><option value="medical_center">Medical Center | مركز طبي</option><option value="medical_complex">Medical Complex | مجمع طبي</option><option value="healthcare_group">Healthcare Group | مجموعة صحية</option><option value="other">Other | أخرى</option>
    </select></label>
    <label>Sector | القطاع<select value={manualOwner.ownership_sector} onChange={e=>setManualOwner(v=>({...v,ownership_sector:e.target.value}))}>
     <option value="private">Private | خاص</option><option value="government">Government | حكومي</option><option value="military">Military | عسكري</option><option value="national_guard">National Guard | حرس وطني</option><option value="university">University | جامعي</option><option value="royal_commission">Royal Commission | هيئة ملكية</option><option value="other">Other | أخرى</option>
    </select></label>
    <label>Region | المنطقة<input value={manualOwner.region} onChange={e=>setManualOwner(v=>({...v,region:e.target.value}))}/></label>
    <label>City | المدينة<input value={manualOwner.city} onChange={e=>setManualOwner(v=>({...v,city:e.target.value}))}/></label>
   </div>
   <button type="button" className="btn primary" onClick={()=>run(addManualOwner)} disabled={busy}>Save Owner | حفظ المالك</button>
  </div>}
  </form>

  <form className="facility-panel" onSubmit={submitLink}><h2>{t('esLinkSite')}</h2><div className="form-grid">
   <label>{t('esProject')}<select required value={link.project_id} onChange={e=>setLink(v=>({...v,project_id:e.target.value,site_id:''}))}><option value="">—</option>{data.projects.map(x=><option key={x.id} value={x.id}>{x.project_code} — {x.name}</option>)}</select></label>
   <label>{t('esSite')}<select required value={link.site_id} onChange={e=>setLink(v=>({...v,site_id:e.target.value}))}><option value="">—</option>{dir.sites.filter(x=>{const p=data.projects.find(p=>p.id===link.project_id);return p&&x.organization_id===org&&x.client_id===p.client_id}).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
  </div><button className="btn primary">{t('esLinkSite')}</button></form>

  <form className="facility-panel" onSubmit={submitTeam}><h2>{t('esNewTeam')}</h2><div className="form-grid">
   <label>{t('esProject')}<select required value={team.project_id} onChange={e=>setTeam(v=>({...v,project_id:e.target.value,site_id:''}))}><option value="">—</option>{data.projects.map(x=><option key={x.id} value={x.id}>{x.project_code} — {x.name}</option>)}</select></label>
   <label>{t('esService')}<select value={team.service_line_id} onChange={e=>setTeam(v=>({...v,service_line_id:e.target.value}))}><option value="">—</option>{data.service_lines.filter(x=>x.is_active).map(x=><option key={x.id} value={x.id}>{x.name_en}</option>)}</select></label>
   <label>{t('esSite')}<select value={team.site_id} onChange={e=>setTeam(v=>({...v,site_id:e.target.value}))}><option value="">—</option>{projectSites.map(x=><option key={x.site_id} value={x.site_id}>{x.site_name}</option>)}</select></label>
   <label>{t('esName')}<input required value={team.name} onChange={e=>setTeam(v=>({...v,name:e.target.value}))}/></label>
   <label>{t('esDiscipline')}<input value={team.discipline_code} onChange={e=>setTeam(v=>({...v,discipline_code:e.target.value}))}/></label>
   <label>{t('esShift')}<input value={team.shift_code} onChange={e=>setTeam(v=>({...v,shift_code:e.target.value}))}/></label>
  </div><button className="btn primary">{t('esCreate')}</button></form>

  <form className="facility-panel" onSubmit={submitMember}><h2>{t('esAddMember')}</h2><div className="form-grid">
   <label>{t('esTeams')}<select required value={member.team_id} onChange={e=>setMember(v=>({...v,team_id:e.target.value}))}><option value="">—</option>{data.teams.map(x=><option key={x.id} value={x.id}>{x.team_code} — {x.name}</option>)}</select></label>
   <label>{t('esUser')}<select required value={member.user_id} onChange={e=>setMember(v=>({...v,user_id:e.target.value}))}><option value="">—</option>{users.map(x=><option key={x.id} value={x.id}>{x.full_name||x.email}</option>)}</select></label>
   <label>{t('esRole')}<select value={member.role_id} onChange={e=>setMember(v=>({...v,role_id:e.target.value}))}><option value="">—</option>{roles.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label>{t('esMemberType')}<select value={member.member_type} onChange={e=>setMember(v=>({...v,member_type:e.target.value}))}>{['manager','supervisor','technician','worker','support'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label><input type="checkbox" checked={member.is_lead} onChange={e=>setMember(v=>({...v,is_lead:e.target.checked}))}/> {t('esLead')}</label>
  </div><button className="btn primary">{t('esAddMember')}</button></form>

  <div className="facility-panel"><h2>{t('esProjects')}</h2><div className="security-check-list">{data.projects.map(p=><article className="security-check-card" key={p.id}><div><strong>{p.project_code} — {p.name}</strong><p>{p.status}</p></div><div>{p.sites?.map(s=><span className="security-pill pass" key={s.site_id}>{s.site_name}</span>)}</div></article>)}</div></div>
  <div className="facility-panel"><h2>{t('esTeams')}</h2><div className="security-check-list">{data.teams.map(x=><article className="security-check-card" key={x.id}><div><strong>{x.team_code} — {x.name}</strong><p>{x.discipline_code||'—'} · {x.shift_code||'—'}</p></div><details className="security-human-details"><summary>{t('esMembers')} ({x.members?.length||0})</summary><div className="security-detail-list">{(x.members||[]).map(m=><div key={m.user_id}>{m.full_name||m.email} — {m.role_code||m.member_type}{m.is_lead?' ★':''}</div>)}</div></details></article>)}</div></div>
 </section>
}
