import {useEffect,useMemo,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {readMasterBundle,writeMaster} from '../lib/masterRecords'
import {createProject,linkProjectSite} from '../lib/enterpriseStructure'

export default function MedicalOperationalSetup(){
 const {lang}=useLanguage()
 const ar=lang==='ar'
 const navigate=useNavigate()
 const [bundle,setBundle]=useState({organizations:[],clients:[],contracts:[],sites:[]})
 const [providerId,setProviderId]=useState('')
 const [ownerId,setOwnerId]=useState('')
 const [newOwner,setNewOwner]=useState('وزارة الصحة')
 const [contractNo,setContractNo]=useState('')
 const [startDate,setStartDate]=useState('')
 const [endDate,setEndDate]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [facilities,setFacilities]=useState([
  {name:'مستشفى الدمام المركزي',project_name:'مشروع صيانة الأجهزة الطبية - مستشفى الدمام المركزي',city:'الدمام'},
  {name:'مستشفى العيون',project_name:'مشروع صيانة الأجهزة الطبية - مستشفى العيون',city:'الدمام'}
 ])

 async function load(){
  try{
   const x=await readMasterBundle()
   setBundle(x)
   if(!providerId && x.organizations?.length)setProviderId(x.organizations[0].id)
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[])

 const owners=useMemo(()=>bundle.clients.filter(x=>!providerId||x.organization_id===providerId),[bundle,providerId])

 const updateFacility=(i,k,v)=>setFacilities(rows=>rows.map((r,n)=>n===i?{...r,[k]:v}:r))
 const addFacility=()=>setFacilities(rows=>[...rows,{name:'',project_name:'',city:''}])

 async function createStructure(){
  setBusy(true);setError('');setSuccess('')
  try{
   if(!providerId)throw Error(ar?'اختر شركة الصيانة':'Select service provider')
   if(!contractNo.trim())throw Error(ar?'رقم العقد مطلوب':'Contract number is required')
   if(!facilities.length)throw Error(ar?'أضف مستشفى واحداً على الأقل':'Add at least one hospital')

   let owner=owners.find(x=>x.id===ownerId)
   if(!owner){
    if(!newOwner.trim())throw Error(ar?'اسم المالك مطلوب':'Owner name is required')
    owner=await writeMaster('clients',{
     organization_id:providerId,
     name:newOwner.trim(),
     email:null,
     phone:null,
     status:'active'
    })
   }

   const contract=await writeMaster('contracts',{
    organization_id:providerId,
    client_id:owner.id,
    contract_number:contractNo.trim(),
    contract_type:'medical_maintenance',
    start_date:startDate||null,
    end_date:endDate||null,
    contract_value:null,
    status:'active'
   })

   const created=[]
   for(const f of facilities){
    if(!f.name.trim()||!f.project_name.trim())throw Error(ar?'اسم المستشفى واسم المشروع مطلوبان':'Hospital and project name are required')

    const site=await writeMaster('sites',{
     organization_id:providerId,
     client_id:owner.id,
     contract_id:contract.id,
     name:f.name.trim(),
     city:f.city||null,
     address:null,
     status:'active'
    })

    const projectResult=await createProject({
     organization_id:providerId,
     client_id:owner.id,
     contract_id:contract.id,
     name:f.project_name.trim(),
     start_date:startDate||null,
     end_date:endDate||null
    })

    const projectId=Array.isArray(projectResult)
     ?(projectResult[0]?.id||projectResult[0]?.project_id)
     :(projectResult?.id||projectResult?.project_id||projectResult)

    if(!projectId)throw Error('Project ID was not returned')
    await linkProjectSite(projectId,site.id)
    created.push({site_id:site.id,project_id:projectId})
   }

   localStorage.setItem('basmat.medical.operational.context',JSON.stringify({
    organization_id:providerId,
    owner_id:owner.id,
    contract_id:contract.id,
    facilities:created,
    created_at:new Date().toISOString()
   }))

   setSuccess(ar?'تم إنشاء الهيكل التشغيلي بنجاح':'Operational structure created successfully')
   await load()
  }catch(e){setError(e.message||String(e))}
  finally{setBusy(false)}
 }

 const input={padding:'10px 12px',border:'1px solid #d0d5dd',borderRadius:8,width:'100%'}
 const card={background:'#fff',border:'1px solid #e4e7ec',borderRadius:12,padding:16}

 return <div style={{padding:20,maxWidth:1100,margin:'0 auto'}}>
  <h1>{ar?'إعداد التشغيل الطبي':'Medical Operations Setup'}</h1>
  <p>{ar?'شركة الصيانة ← المالك ← العقد ← المستشفى ← المشروع':'Service Provider → Owner → Contract → Hospital → Project'}</p>

  {error&&<div style={{...card,borderColor:'#fda29b',marginBottom:12}}>{error}</div>}
  {success&&<div style={{...card,borderColor:'#6ce9a6',marginBottom:12}}>{success}</div>}

  <div style={{...card,display:'grid',gap:14}}>
   <label>{ar?'شركة الصيانة / المنظمة التشغيلية':'Maintenance service provider / operating organization'}
    <select value={providerId} onChange={e=>setProviderId(e.target.value)} style={input}>
     <option value="">{ar?'اختر':'Select'}</option>
     {bundle.organizations.filter(x=>x.status!=='archived').map(x=><option key={x.id} value={x.id}>{x.name||x.name_ar||x.name_en||x.code}</option>)}
    </select>
   </label>

   <label>{ar?'مالك موجود - اختياري':'Existing owner - optional'}
    <select value={ownerId} onChange={e=>setOwnerId(e.target.value)} style={input}>
     <option value="">{ar?'إنشاء مالك جديد':'Create new owner'}</option>
     {owners.filter(x=>x.status!=='archived').map(x=><option key={x.id} value={x.id}>{x.name||x.code}</option>)}
    </select>
   </label>

   {!ownerId&&<label>{ar?'اسم المالك':'Owner name'}
    <input value={newOwner} onChange={e=>setNewOwner(e.target.value)} style={input}/>
   </label>}

   <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12}}>
    <label>{ar?'رقم العقد':'Contract number'}<input value={contractNo} onChange={e=>setContractNo(e.target.value)} style={input}/></label>
    <label>{ar?'تاريخ البداية':'Start date'}<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={input}/></label>
    <label>{ar?'تاريخ النهاية':'End date'}<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={input}/></label>
   </div>

   <h3>{ar?'المستشفيات والمشاريع':'Hospitals and Projects'}</h3>
   {facilities.map((f,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1.5fr .7fr',gap:10}}>
    <input style={input} value={f.name} onChange={e=>updateFacility(i,'name',e.target.value)} placeholder={ar?'اسم المستشفى':'Hospital name'}/>
    <input style={input} value={f.project_name} onChange={e=>updateFacility(i,'project_name',e.target.value)} placeholder={ar?'اسم المشروع':'Project name'}/>
    <input style={input} value={f.city} onChange={e=>updateFacility(i,'city',e.target.value)} placeholder={ar?'المدينة':'City'}/>
   </div>)}

   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
    <button className="btn" onClick={addFacility}>{ar?'إضافة مستشفى':'Add hospital'}</button>
    <button className="btn" disabled={busy} onClick={createStructure}>{busy?(ar?'جاري الإنشاء...':'Creating...'):(ar?'إنشاء الهيكل التشغيلي':'Create operational structure')}</button>
   </div>

   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
    <button className="btn" onClick={()=>navigate('/asset-library')}>{ar?'المكتبة الطبية':'Medical Library'}</button>
    <button className="btn" onClick={()=>navigate('/assets')}>{ar?'الأجهزة':'Assets'}</button>
    <button className="btn" onClick={()=>navigate('/ppm')}>PPM</button>
    <button className="btn" onClick={()=>navigate('/corrective')}>{ar?'أوامر العمل':'Work Orders'}</button>
   </div>
  </div>
 </div>
}
