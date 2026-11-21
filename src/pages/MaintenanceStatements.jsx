import {useEffect,useState} from 'react'
import {Link,useNavigate,useOutletContext} from 'react-router-dom'
import {statementAction,migrationMissing,cycleRpc} from '../lib/maintenanceCycle'
import {CycleField,CycleError,CycleSetupNotice,CycleStatus,useCycleLanguage} from '../components/CycleFields'
import {statementOwners,projectsForOwner,statementReady,statementInboxCapabilities} from '../lib/statementProjects'
import {loadStatementCenter} from '../lib/statementCenter'
import FinalStatementPanel from '../components/FinalStatementPanel'
import '../cycle.css'
export default function MaintenanceStatements(){
 const {companyId}=useOutletContext()
 const L=useCycleLanguage(),navigate=useNavigate(),[data,setData]=useState(null),[missing,setMissing]=useState(false),[error,setError]=useState(null),[busy,setBusy]=useState(false),[owner,setOwner]=useState(''),[form,setForm]=useState({project_id:'',period_start:'',period_end:'',kind:'monthly',month:''})
 async function load(){
  setError(null)
  try{setData(await loadStatementCenter(cycleRpc,companyId));setMissing(false)}
  catch(e){if(migrationMissing(e))setMissing(true);else setError(e)}
 }

 useEffect(()=>{load()},[])
 const projects=data?.projects||[],owners=statementOwners(projects),ownerProjects=projectsForOwner(projects,owner),selected=ownerProjects.find(p=>p.id===form.project_id),ready=statementReady(selected),{canCreate,activationProjects}=statementInboxCapabilities(projects)
 async function activate(project){if(busy)return;setBusy(true);setError(null);try{await cycleRpc('bf44_policy_activate',{p_project:project.id});await load()}catch(e){setError(e)}finally{setBusy(false)}}
 async function create(e){e.preventDefault();if(busy||!ready)return;setBusy(true);setError(null);try{const id=form.kind==='monthly'?await cycleRpc('bf44_create_monthly_statement',{p_project:form.project_id,p_month:form.month+'-01'}):await statementAction('create',null,form);navigate('/statements/'+id)}catch(e){setError(e)}finally{setBusy(false)}}
 if(missing)return <CycleSetupNotice/>
 return <section className="facility-module"><div className="page-head"><div><h1>{L('مستخلصات أعمال الصيانة','Maintenance work statements')}</h1><p>{L('شهادة إنجاز واحدة لكل بند؛ اعتماد المستخلص يغلق دورة الصيانة المرتبطة.','One completion certificate per line; statement approval closes its maintenance cycles.')}</p></div><button className="btn secondary" onClick={load}>{L('تحديث','Refresh')}</button></div><CycleError error={error}/>
  {activationProjects.map(project=><div className="facility-panel no-print" key={project.id}>
   <span className="workspace-eyebrow">{L('الإجراء المطلوب من ممثل المالك','Owner representative action')}</span>
   <h2>{L('تفعيل سلسلة اعتماد المشروع','Activate project approval chain')}</h2>
   <p>{project.owner} · {project.name} · {project.contract}</p>
   <p>{L('شركة الصيانة تُعدّ المستخلص وتقدّمه. تفعيلك يتيح بدء مسار الاعتماد، ولا يُعدّ اعتمادًا للمستخلص أو لقيمته.','The maintenance company prepares and submits the statement. Activation enables the approval workflow; it does not approve a statement or its amount.')}</p>
   <button type="button" className="btn primary" disabled={busy} onClick={()=>activate(project)}>{L('تفعيل سلسلة الاعتماد بصفتي ممثل المالك','Activate approval chain as owner representative')}</button>
  </div>)}
  {data&&!canCreate&&<div className="facility-panel" role="status"><h2>{L('متابعة مستخلصات الشركة','Company statement review')}</h2><p>{L('تُعدّ شركة الصيانة المستخلص وتقدّمه. يظهر لك إجراء المراجعة والاعتماد أو الإعادة بعد تقديمه؛ المسودة الحالية ما زالت لدى الشركة.','The maintenance company prepares and submits the statement. Review, approval and return actions become available after submission; the current draft remains with the company.')}</p></div>}
  {data&&canCreate&&<form className="facility-panel" onSubmit={create}>
   <h2>{L('مستخلص جديد','New statement')}</h2>
   <div className="form-grid">
    <CycleField label={L('المالك','Owner')}><select required value={owner} onChange={e=>{setOwner(e.target.value);setForm(f=>({...f,project_id:''}))}}><option value="">{L('اختر المالك','Select owner')}</option>{owners.map(name=><option key={name} value={name}>{name}</option>)}</select></CycleField>
    <CycleField label={L('المشروع','Project')}><select required disabled={!owner} value={form.project_id} onChange={e=>setForm({...form,project_id:e.target.value})}><option value="">{L('اختر المشروع','Select project')}</option>{ownerProjects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></CycleField>
    <CycleField label={L('نوع المستخلص','Statement type')}><select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>
     <option value="monthly">{L('شهري','Monthly')}</option><option value="period">{L('فترة مخصصة','Custom period')}</option>
    </select></CycleField>
    {form.kind==='monthly'?<CycleField label={L('الشهر','Month')}><input type="month" required pattern="[0-9]{4}-[0-9]{2}" placeholder="YYYY-MM" value={form.month} onChange={e=>setForm({...form,month:e.target.value})}/></CycleField>:<>
    <CycleField label={L('بداية الفترة','Period start')}><input type="date" required value={form.period_start} onChange={e=>setForm({...form,period_start:e.target.value})}/></CycleField>
    <CycleField label={L('نهاية الفترة','Period end')}><input type="date" required min={form.period_start} value={form.period_end} onChange={e=>setForm({...form,period_end:e.target.value})}/></CycleField>
    </>}

   </div>
   {!owners.length&&<p role="status">{L('لا توجد مشاريع مرتبطة بمالك ضمن نطاق وصولك. راجع إسناد المشروع في الملاك والمشاريع.','No owner-linked projects are available within your access scope. Review project access in Owners & Projects.')}</p>}
   {selected&&<div className="cycle-chain"><span>{L('المالك: ','Owner: ')}{selected.owner}</span><span>{L('المشروع: ','Project: ')}{selected.name}</span><span>{L('العقد: ','Contract: ')}{selected.contract||'—'}</span></div>}
   {selected&&!ready&&<div role="status">
    <p>{selected.setup_required?L('المشروع مسجل، لكن إعداد الوصول المالي وسلسلة اعتماده غير مكتمل. أكمل إسناد المستخدمين والصلاحيات لهذا المشروع أولًا.','This project is registered, but its financial access and approval chain are not configured. Complete its user assignments and permissions first.'):selected.policy?.status!=='active'?L('المشروع ظاهر، لكن يلزم إعداد سلسلة الاعتماد وتفعيلها بواسطة ممثل المالك قبل إنشاء المستخلص.','The project is available. Configure its approval chain and have the owner representative activate it before creating a statement.'):L('يلزم أن ينشئ المستخلص مستخدم مخوّل بإدارة مالية هذا المشروع.','A user authorized to manage this project’s finances must create the statement.')}</p>
    {selected.setup_required&&<Link className="btn secondary" to="/project-setup">{L('مراجعة إعداد المشروع والصلاحيات','Review project setup and access')}</Link>}
    {selected.policy?.status!=='active'&&(selected.can_manage||selected.can_activate)&&<Link className="btn secondary" to={'/project-setup?project='+encodeURIComponent(selected.id)}>{L('إعداد اعتماد هذا المشروع','Set up this project’s approval chain')}</Link>}
   </div>}
   <button disabled={busy||!ready} className="btn primary">{L('إنشاء مسودة المستخلص','Create draft statement')}</button>
  </form>}

  {data&&<FinalStatementPanel projects={projects}/>}
  <div className="table-wrap"><table><thead><tr>{[L('رقم المستخلص','Statement'),L('المالك','Owner'),L('المشروع','Project'),L('النوع','Type'),L('الفترة','Period'),L('الحالة','Status')].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data?.statements.map(s=><tr key={s.id}><td><Link to={'/statements/'+s.id}>{s.statement_number}</Link></td><td>{data.projects.find(p=>p.id===s.project_id)?.owner||'—'}</td><td>{data.projects.find(p=>p.id===s.project_id)?.name||'—'}</td><td>{s.statement_kind==='monthly'?L('شهري','Monthly'):L('فترة مخصصة','Custom period')}</td><td>{s.period_start} — {s.period_end}</td><td><CycleStatus value={s.status}/></td></tr>)}</tbody></table>{data&&!data.statements.length&&<p className="empty">{L('لا توجد مستخلصات ضمن صلاحياتك.','No statements within your access scope.')}</p>}</div><p className="workspace-muted">{L('القيم تمثل قيمة الأعمال المطالب بها بعملة العقد. تكاليف المخزون الداخلية تبقى مستقلة عن قيمة المطالبة.','Values represent claimed work in the contract currency. Internal inventory costs remain separate from claim values.')}</p>
 </section>
}



