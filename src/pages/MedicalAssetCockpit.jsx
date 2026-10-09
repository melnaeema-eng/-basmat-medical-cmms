import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useLanguage} from '../i18n/LanguageContext'
import {useAuth} from '../context/AuthContext'
import {supabase} from '../lib/supabaseClient'
import {loadMasterAssetLibrary,adoptMasterTemplates} from '../lib/masterAssetLibrary'
import {loadPPM,ppmAction} from '../lib/ppm'
import {save} from '../lib/facility'
import {
  searchMedicalAssets,loadMedicalAssetCockpit,loadAssetActionData,
  createAssetPPM,assignPPMJob,createFaultRequest,convertRequestToWorkOrder,
  createDirectWorkOrder,loadMedicalSpareUsage
} from '../lib/medicalAssetCockpit'

const today=()=>new Date().toISOString().slice(0,10)
const txt=v=>v===null||v===undefined||v===''?'—':String(v)
const date=v=>v?new Date(v).toLocaleDateString():'—'

function Panel({title,children}){
  return <div className="facility-panel" style={{padding:18,borderRadius:16}}>
    {title&&<h2 style={{marginTop:0}}>{title}</h2>}
    {children}
  </div>
}

function Field({label,children}){
  return <label style={{display:'grid',gap:6}}>
    <span style={{fontWeight:700}}>{label}</span>
    {children}
  </label>
}

function Stat({label,value}){
  return <div style={{padding:'12px 14px',border:'1px solid #dbe3ee',borderRadius:12,background:'#fff'}}>
    <div style={{fontSize:12,color:'#64748b',marginBottom:4}}>{label}</div>
    <div style={{fontWeight:800}}>{txt(value)}</div>
  </div>
}

function ActionButton({children,onClick,primary=false}){
  return <button
    type="button"
    onClick={onClick}
    className={primary?'btn primary':'btn'}
    style={{minWidth:90,whiteSpace:'nowrap'}}
  >
    {children}
  </button>
}


export default function MedicalAssetCockpit(){
  const {lang}=useLanguage()
  const ar=lang==='ar'
  const nav=useNavigate()
  const {can,profile,access}=useAuth()
  const canCreateAsset=org=>!!org&&(!!profile?.is_super_admin||!!access?.super_admin||can('medical.assets.manage',org)||can('assets.manage',org))

  const [query,setQuery]=useState('')
  const [assets,setAssets]=useState([])
  const [asset,setAsset]=useState(null)
  const [ctx,setCtx]=useState(null)
  const [actions,setActions]=useState(null)
  const [spares,setSpares]=useState([])
  const [mode,setMode]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [libraryCtx,setLibraryCtx]=useState({
    loading:false,
    project:null,
    templates:[],
    procedures:[],
    master:null,
    ppm:null
  })

  const [deployCtx,setDeployCtx]=useState({
    loading:true,master:null,ppm:null,projects:[],projectSites:[],sites:[]
  })
  const [deploy,setDeploy]=useState({
    organization_id:'',project_id:'',site_id:'',
    asset_type_id:'',manufacturer_id:'',option_id:'',
    serial_number:'',exact_model:''
  })

  const [ppm,setPpm]=useState({procedure_id:'',start_date:today(),months:12,job_id:'',user_id:''})
  const [fault,setFault]=useState({title:'',description:'',priority:'P3',create_wo:true})
  const [wo,setWo]=useState({title:'',description:'',priority:'P3'})

  const reloadList=async()=>{
    setBusy(true)
    setError('')
    try{
      setAssets(await searchMedicalAssets(query))
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  useEffect(()=>{reloadList()},[])

  const loadDeployment=async()=>{
    setDeployCtx(v=>({...v,loading:true}))
    try{
      const [masterData,ppmData,projectSitesRes,sitesRes]=await Promise.all([
        loadMasterAssetLibrary(),
        loadPPM(),
        supabase.from('bf35_project_sites').select('project_id,organization_id,site_id,client_id'),
        supabase.from('bf_sites').select('*').eq('status','active').order('name')
      ])
      if(projectSitesRes.error)throw projectSitesRes.error
      if(sitesRes.error)throw sitesRes.error

      const orgRows=(ppmData?.organizations||[]).filter(x=>x.status!=='archived')
      const batches=await Promise.all(orgRows.map(async o=>{
        const {data,error}=await supabase.rpc('bf35_structure',{p_org:o.id})
        if(error)return[]
        return (data?.projects||[]).map(x=>({...x,organization_id:x.organization_id||o.id}))
      }))

      setDeployCtx({
        loading:false,
        master:masterData,
        ppm:ppmData,
        projects:batches.flat(),
        projectSites:projectSitesRes.data||[],
        sites:sitesRes.data||[]
      })
    }catch(e){
      setDeployCtx(v=>({...v,loading:false}))
      setError(e.message)
    }
  }

  useEffect(()=>{loadDeployment()},[])

  const openAsset=async(row,nextMode='')=>{
    setAsset(row)
    setMode(nextMode)
    setError('')
    setSuccess('')
    setBusy(true)
    try{
      const [c,a,s]=await Promise.all([
        loadMedicalAssetCockpit(row.asset_id),
        loadAssetActionData(row),
        loadMedicalSpareUsage(row.asset_id)
      ])
      setCtx(c)
      setActions(a)
      setSpares(s)
      setFault(v=>({...v,title:`${ar?'عطل جهاز':'Asset Fault'} - ${row.asset_tag}`}))
      setWo(v=>({...v,title:`${ar?'أمر عمل':'Work Order'} - ${row.asset_tag}`}))
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const refresh=()=>asset&&openAsset(asset,mode)

  const loadLibraryForAsset=async(row)=>{
    if(!row)return
    setLibraryCtx(v=>({...v,loading:true}))
    try{
      const [masterData,ppmData,mapResult,structureResult]=await Promise.all([
        loadMasterAssetLibrary(),
        loadPPM(),
        supabase
          .from('bf35_project_sites')
          .select('project_id,organization_id,site_id,client_id')
          .eq('organization_id',row.organization_id)
          .eq('site_id',row.site_id)
          .limit(1),
        supabase.rpc('bf35_structure',{p_org:row.organization_id})
      ])

      if(mapResult.error)throw mapResult.error

      const projectMap=(mapResult.data||[])[0]||null
      const projectRow=(structureResult.data?.projects||[]).find(
        p=>String(p.id||p.project_id)===String(projectMap?.project_id||'')
      )||null
      const orgRow=(ppmData?.organizations||[]).find(o=>String(o.id)===String(row.organization_id))||null
      const siteRow=(ppmData?.sites||[]).find(s=>String(s.id)===String(row.site_id))||null
      const typeId=row.master_type_id||row.asset_type_id||row.category_id||null
      const manufacturerId=row.manufacturer_id||null

      const templates=(masterData?.templates||[]).filter(t=>
        t.status!=='archived' &&
        (!typeId||t.asset_type_id===typeId) &&
        (!manufacturerId||!t.manufacturer_id||t.manufacturer_id===manufacturerId)
      )

      const procedures=(ppmData?.procedures||[]).filter(p=>
        p.organization_id===row.organization_id &&
        p.status!=='archived'
      )

      setLibraryCtx({
        loading:false,
        project:projectMap,
        projectName:projectRow?.name||projectRow?.project_name||projectRow?.project_code||projectMap?.project_id||'',
        organizationName:orgRow?.name||orgRow?.code||row.organization_id||'',
        siteName:siteRow?.name||siteRow?.code||row.site_id||'',
        templates,
        procedures,
        master:masterData,
        ppm:ppmData
      })
    }catch(e){
      setLibraryCtx(v=>({...v,loading:false}))
      setError(e.message)
    }
  }

  const prepareLibraryPPM=async()=>{
    if(!asset)return
    const typeId=asset.master_type_id||asset.asset_type_id||asset.category_id||null
    if(!asset.organization_id||!typeId){
      setError(ar?'بيانات المنظمة أو نوع الجهاز غير مكتملة.':'Organization or asset type is missing.')
      return
    }

    setBusy(true);setError('');setSuccess('')
    try{
      const result=await adoptMasterTemplates(
        asset.organization_id,
        typeId,
        asset.manufacturer_id||null
      )
      await loadLibraryForAsset(asset)
      setSuccess(ar
        ?`تم اعتماد قوالب المكتبة وإنشاء ${result?.procedures_created||0} إجراء PPM جديد.`
        :`Library templates adopted; ${result?.procedures_created||0} new PPM procedures created.`)
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const createOfficialPlan=async(procedureId)=>{
    if(!asset||!procedureId)return
    if(!asset.site_id){
      setError(ar?'الجهاز غير مرتبط بموقع حالي.':'Asset is not linked to a current site.')
      return
    }
    if(!libraryCtx.project?.project_id){
      setError(ar?'الموقع غير مربوط بمشروع حالي.':'Current site is not linked to a project.')
      return
    }

    setBusy(true);setError('');setSuccess('')
    try{
      const site=(libraryCtx.ppm?.sites||[]).find(s=>s.id===asset.site_id)
      await ppmAction('plan',null,'create',{
        organization_id:asset.organization_id,
        asset_id:asset.asset_id||asset.id,
        procedure_id:procedureId,
        contract_id:site?.contract_id||asset.contract_id||'',
        start_date:ppm.start_date,
        interval_count:1
      })
      setSuccess(ar
        ?'تم إنشاء خطة PPM الرسمية للجهاز، وستظهر في موديول الصيانة الوقائية.'
        :'Official PPM plan created and will appear in Preventive Maintenance.')
      await loadLibraryForAsset(asset)
      await refresh()
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const doPPM=async()=>{
    setBusy(true)
    setError('')
    setSuccess('')
    try{
      const r=await createAssetPPM({
        asset,
        procedureId:ppm.procedure_id,
        startDate:ppm.start_date,
        horizonMonths:ppm.months,
        contractId:asset.contract_id
      })
      setSuccess(ar?`تم إنشاء وتفعيل خطة PPM وإنشاء ${r.jobs.length} مهمة.`:`PPM plan activated; ${r.jobs.length} jobs generated.`)
      setMode('ppm-jobs')
      await refresh()
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const doAssign=async()=>{
    setBusy(true)
    setError('')
    setSuccess('')
    try{
      await assignPPMJob(ppm.job_id,ppm.user_id)
      setSuccess(ar?'تم إسناد مهمة PPM وإنشاء أمر العمل المرتبط.':'PPM assigned and linked work order created.')
      await refresh()
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const doFault=async()=>{
    setBusy(true)
    setError('')
    setSuccess('')
    try{
      const req=await createFaultRequest({asset,...fault})
      let woId=null
      if(fault.create_wo)woId=await convertRequestToWorkOrder(req)
      setSuccess(ar?`تم إنشاء البلاغ${woId?' وأمر العمل':''}.`:`Fault request${woId?' and work order':''} created.`)
      setMode('history')
      await refresh()
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const doWO=async()=>{
    setBusy(true)
    setError('')
    setSuccess('')
    try{
      await createDirectWorkOrder({asset,...wo})
      setSuccess(ar?'تم إنشاء أمر العمل للجهاز.':'Work order created for asset.')
      setMode('history')
      await refresh()
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }


  const deployOrgs=(deployCtx.ppm?.organizations||[]).filter(x=>x.status!=='archived')
  const deployProjects=(deployCtx.projects||[]).filter(
    p=>!deploy.organization_id||String(p.organization_id)===String(deploy.organization_id)
  )
  const deployProjectSiteIds=new Set(
    (deployCtx.projectSites||[])
      .filter(x=>String(x.project_id)===String(deploy.project_id||''))
      .map(x=>String(x.site_id))
  )
  const deploySites=(deployCtx.sites||[]).filter(s=>
    (!deploy.organization_id||String(s.organization_id)===String(deploy.organization_id)) &&
    (!deploy.project_id||deployProjectSiteIds.has(String(s.id)))
  )
  const automaticSiteId=deploy.project_id&&deploySites.length===1?String(deploySites[0].id):''
  const deployTypes=(deployCtx.master?.types||[]).filter(t=>t.status!=='archived')
  const deployManufacturers=(deployCtx.master?.manufacturers||[]).filter(m=>
    m.status!=='archived' &&
    (deployCtx.master?.options||[]).some(o=>
      String(o.asset_type_id)===String(deploy.asset_type_id||'') &&
      String(o.manufacturer_id)===String(m.id)
    )
  )
  const deployOptions=(deployCtx.master?.options||[]).filter(o=>
    (!deploy.asset_type_id||String(o.asset_type_id)===String(deploy.asset_type_id)) &&
    (!deploy.manufacturer_id||String(o.manufacturer_id)===String(deploy.manufacturer_id))
  )

  const chooseDeviceFromLibrary=(typeId,manufacturerId='',optionId='')=>{
    const option=(deployCtx.master?.options||[]).find(o=>String(o.id)===String(optionId))
    setDeploy(v=>({
      ...v,
      asset_type_id:String(typeId),
      manufacturer_id:manufacturerId?String(manufacturerId):'',
      option_id:optionId?String(optionId):'',
      exact_model:option?.model_family||''
    }))
    setError('');setSuccess('')
    document.getElementById('medical-asset-deploy')?.scrollIntoView({behavior:'smooth',block:'start'})
  }
  const addAssetFromLibrary=async()=>{
    if(!canCreateAsset(deploy.organization_id)){
      setError(ar?'ليس لديك صلاحية إضافة أجهزة لهذه المؤسسة.':'No asset-create permission for this organization.')
      return
    }
    if(!deploy.organization_id||!deploy.project_id||!deploy.asset_type_id){
      setError(['البيانات الناقصة:', !deploy.organization_id&&'المنظمة', !deploy.project_id&&'المشروع', !deploy.asset_type_id&&'نوع الجهاز'].filter(Boolean).join(' '))
      return
    }
    // An asset belongs to the selected organization even when its project has
    // multiple sites. Do not invent a site or a room.
    const link=automaticSiteId?(deployCtx.projectSites||[]).find(x=>
      String(x.project_id)===String(deploy.project_id)&&
      String(x.site_id)===String(automaticSiteId)&&
      String(x.organization_id)===String(deploy.organization_id)
    ):null
    const siteRow=link?(deployCtx.sites||[]).find(s=>String(s.id)===String(automaticSiteId)):null

    const typeRow=(deployCtx.master?.types||[]).find(t=>String(t.id)===String(deploy.asset_type_id))
    const manufacturerRow=(deployCtx.master?.manufacturers||[]).find(m=>String(m.id)===String(deploy.manufacturer_id))
    const optionRow=(deployCtx.master?.options||[]).find(o=>String(o.id)===String(deploy.option_id))

    setBusy(true);setError('');setSuccess('')
    try{
      const adopted=await adoptMasterTemplates(
        deploy.organization_id,
        deploy.asset_type_id,
        deploy.manufacturer_id||null
      )

      let categoryId=adopted?.category_id||null

      if(!categoryId){
        const {data:found,error:lookupError}=await supabase
          .from('bf_asset_categories')
          .select('id')
          .eq('organization_id',deploy.organization_id)
          .eq('master_asset_type_id',deploy.asset_type_id)
          .eq('status','active')
          .limit(1)

        if(lookupError)throw lookupError
        categoryId=found?.[0]?.id||null
      }

      if(!categoryId){
        const newCategory={
          organization_id:deploy.organization_id,
          tenant_id:deploy.organization_id,
          master_asset_type_id:null,
          code:'MED-'+crypto.randomUUID().slice(0,12).toUpperCase(),
          name_ar:typeRow?.name_ar||typeRow?.name_en||'جهاز طبي',
          name_en:typeRow?.name_en||typeRow?.name_ar||'Medical Device',
          status:'active'
        }
        const {data:created,error:createError}=await supabase
          .from('bf_asset_categories')
          .insert(newCategory).select('id').single()

        if(createError)throw createError
        categoryId=created.id
      }
      const projectRow=(deployCtx.projects||[]).find(p=>
        String(p.id||p.project_id)===String(deploy.project_id) &&
        String(p.organization_id)===String(deploy.organization_id)
      )
      const projectLinks=(deployCtx.projectSites||[]).filter(x=>
        String(x.project_id)===String(deploy.project_id) &&
        String(x.organization_id)===String(deploy.organization_id)
      )
      const ownerIds=[...new Set([
        projectRow?.client_id,
        ...projectLinks.map(x=>x.client_id),
        ...projectLinks.map(x=>(deployCtx.sites||[]).find(s=>
          String(s.id)===String(x.site_id) &&
          String(s.organization_id)===String(deploy.organization_id)
        )?.client_id)
      ].filter(Boolean).map(String))]
      if(ownerIds.length!==1){
        throw Error('Project owner is missing or ambiguous. Assign one owner to the project before adding assets.')
      }
      const resolvedClientId=ownerIds[0]
      const payload={
        organization_id:deploy.organization_id,
        client_id:resolvedClientId,
        site_id:link?automaticSiteId:null,
        category_id:categoryId,
        name_ar:typeRow?.name_ar||typeRow?.name_en||'جهاز طبي',
        name_en:typeRow?.name_en||typeRow?.name_ar||'Medical Asset',
        serial_number:deploy.serial_number.trim()||`TEMP-${crypto.randomUUID()}`, 
        manufacturer:manufacturerRow?.name||manufacturerRow?.short_name||null,
        model:(deploy.exact_model||optionRow?.model_family||'').trim()||null,
        status:'active',
        operational_status:'in_service'
      }

      const result=await save('bf_assets',payload,null)
      let tag=''
      if(result?.id){
        const {data}=await supabase.from('bf_assets').select('asset_tag').eq('id',result.id).single()
        tag=data?.asset_tag||''
      }

      setSuccess(ar
        ?`تم حفظ الجهاز ضمن أصول المنظمة${link?' وربطه بموقع المشروع':''}${tag?` برقم ${tag}`:''}. يمكن استكمال موقعه ورقمه التسلسلي الحقيقي لاحقاً.`
        :`Asset registered under the organization${link?' and linked to the project site':''}${tag?` as ${tag}`:''}. Complete the real serial/site later if needed.`)

      setDeploy(v=>({...v,serial_number:'',exact_model:'',option_id:''}))
      await Promise.all([reloadList(),loadDeployment()])
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  const procedures=actions?.procedures||[]
  const jobs=actions?.jobs||[]
  const requests=actions?.requests||[]
  const workOrders=actions?.workOrders||[]
  const staff=actions?.staff||[]
  const nextJob=[...jobs]
    .filter(x=>x.status!=='closed'&&x.status!=='completed')
    .sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')))[0]
  const openWo=workOrders.filter(x=>!['closed','cancelled'].includes(x.status)).length

  return <section
    className="facility-module"
    dir={ar?'rtl':'ltr'}
    style={{
      fontFamily:'Tahoma, Arial, sans-serif',
      fontSize:15,
      lineHeight:1.6
    }}
  >
    <div className="page-head" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
      <div>
        <h1 style={{marginBottom:6}}>
          {ar?'تشغيل الأجهزة الطبية':'Medical Asset Operations'}
        </h1>
        <p className="muted" style={{margin:0}}>
          {ar
            ?'تشغيل الجهاز من مكان واحد: الصيانة الوقائية، الأعطال، أوامر العمل، قطع الغيار والسجل.'
            :'Operate the asset from one place: PPM, faults, work orders, spares and history.'}
        </p>
      </div>
      <button className="btn" onClick={()=>nav('/ppm')}>
        {ar?'مركز الصيانة الوقائية':'PPM Center'}
      </button>
    </div>


    {error&&<div className="alert error">{error}</div>}
    {success&&<div className="alert success">{success}</div>}

    <Panel>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'end'}}>
        <Field label={ar?'البحث عن الجهاز':'Find Asset'}>
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&reloadList()}
            placeholder={ar?'رقم الأصل / السيريال / المصنع / الموديل':'Asset Tag / Serial / Manufacturer / Model'}
            style={{height:46,fontSize:16}}
          />
        </Field>
        <button className="btn primary" style={{height:46,minWidth:110}} disabled={busy} onClick={reloadList}>
          {ar?'بحث':'Search'}
        </button>
      </div>
    </Panel>

    <div id="medical-asset-deploy" />

    <Panel title={ar?'إضافة جهاز من المكتبة إلى المشروع':'Add Asset from Library to Project'}>
      <div className="form-grid">
        <Field label={ar?'المنظمة':'Organization'}>
          <select
            value={deploy.organization_id}
            onChange={e=>setDeploy({
              organization_id:e.target.value,project_id:'',site_id:'',
              asset_type_id:'',manufacturer_id:'',option_id:'',
              serial_number:'',exact_model:''
            })}
          >
            <option value="">{ar?'اختر المنظمة':'Select organization'}</option>
            {deployOrgs.map(o=><option key={o.id} value={o.id}>{o.name||o.code}</option>)}
          </select>
        </Field>

        <Field label={ar?'المشروع':'Project'}>
          <select
            value={deploy.project_id}
            disabled={!deploy.organization_id}
            onChange={e=>{setDeploy(v=>({...v,project_id:e.target.value,site_id:''}))}}
          >
            <option value="">{ar?'اختر المشروع':'Select project'}</option>
            {deployProjects.map(p=><option key={p.id||p.project_id} value={p.id||p.project_id}>
              {p.name||p.project_name||p.project_code||p.id}
            </option>)}
          </select>
        </Field>

        <Field label={ar?'نوع الجهاز من المكتبة':'Library Asset Type'}>
          <select
            value={deploy.asset_type_id}
            onChange={e=>setDeploy(v=>({...v,asset_type_id:e.target.value,manufacturer_id:'',option_id:'',exact_model:''}))}
          >
            <option value="">{ar?'اختر الجهاز':'Select asset type'}</option>
            {deployTypes.map(t=><option key={t.id} value={t.id}>{t.name_ar||t.name_en||t.code}</option>)}
          </select>
        </Field>

        <Field label={ar?'الشركة المصنعة':'Manufacturer'}>
          <select
            value={deploy.manufacturer_id}
            disabled={!deploy.asset_type_id}
            onChange={e=>setDeploy(v=>({...v,manufacturer_id:e.target.value,option_id:'',exact_model:''}))}
          >
            <option value="">{ar?'عام / بدون تحديد':'Generic / Any'}</option>
            {deployManufacturers.map(m=><option key={m.id} value={m.id}>{m.short_name||m.name}</option>)}
          </select>
        </Field>

        <Field label={ar?'الموديل من المكتبة':'Library Model'}>
          <select
            value={deploy.option_id}
            disabled={!deploy.asset_type_id}
            onChange={e=>{
              const o=deployOptions.find(x=>String(x.id)===String(e.target.value))
              setDeploy(v=>({...v,option_id:e.target.value,exact_model:o?.model_family||v.exact_model}))
            }}
          >
            <option value="">{ar?'اختر الموديل أو أدخله يدوياً':'Select model or enter manually'}</option>
            {deployOptions.map(o=><option key={o.id} value={o.id}>{o.model_family||'—'}</option>)}
          </select>
        </Field>

        <Field label={ar?'الموديل الفعلي':'Exact Model'}>
          <input
            value={deploy.exact_model}
            onChange={e=>setDeploy(v=>({...v,exact_model:e.target.value}))}
          />
        </Field>

        <Field label={ar?'الرقم التسلسلي':'Serial Number'}>
          <input
            value={deploy.serial_number}
            onChange={e=>setDeploy(v=>({...v,serial_number:e.target.value}))}
            placeholder={ar?'اختياري — يولّد رقم مؤقت عند تركه فارغاً':'Optional — temporary serial if blank'}
          />
        </Field>
      </div>

      {canCreateAsset(deploy.organization_id)&&<div className="row-actions" style={{marginTop:14}}>
        <button
          className="btn primary"
          onClick={addAssetFromLibrary}
          disabled={busy||deployCtx.loading}
        >
          {ar?'إضافة الجهاز':'Add Asset'}
        </button>
        <span className="muted">
          {ar?'Asset Tag يُنشأ آلياً من النظام.':'Asset Tag is generated automatically.'}
        </span>
      </div>}
    </Panel>

    <div style={{display:'grid',gap:12}}>
      {assets.map(a=>{
        const isSelected=asset?.asset_id===a.asset_id
        return <div
          key={a.asset_id}
          style={{
            background:'#fff',
            border:isSelected?'2px solid #174a7e':'1px solid #dbe3ee',
            borderRadius:16,
            padding:16,
            boxShadow:'0 2px 10px rgba(15,23,42,.04)'
          }}
        >
          <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr auto',gap:14,alignItems:'center'}}>
            <div>
              <div style={{fontSize:12,color:'#64748b',marginBottom:4}}>
                {ar?'رقم الأصل':'Asset Tag'}
              </div>
              <div style={{fontWeight:900,fontSize:18}}>{txt(a.asset_tag)}</div>
              <div style={{marginTop:4,fontWeight:700}}>
                {txt(ar?a.asset_type_ar:a.asset_type_en)}
              </div>
            </div>

            <div>
              <div style={{fontSize:12,color:'#64748b'}}>
                {ar?'المصنع / الموديل':'Manufacturer / Model'}
              </div>
              <div style={{fontWeight:800}}>{txt(a.manufacturer_name)}</div>
              <div>{txt(a.model)}</div>
            </div>

            <div>
              <div style={{fontSize:12,color:'#64748b'}}>
                {ar?'الرقم التسلسلي':'Serial Number'}
              </div>
              <div style={{fontWeight:800}}>{txt(a.serial_number)}</div>
            </div>

            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <ActionButton primary={isSelected&&mode==='ppm'} onClick={async()=>{await openAsset(a,'ppm');await loadLibraryForAsset(a)}}>PPM</ActionButton>
              <ActionButton primary={isSelected&&mode==='fault'} onClick={()=>openAsset(a,'fault')}>
                {ar?'عطل':'Fault'}
              </ActionButton>
              <ActionButton primary={isSelected&&mode==='wo'} onClick={()=>openAsset(a,'wo')}>WO</ActionButton>
              <ActionButton primary={isSelected&&mode==='spares'} onClick={()=>openAsset(a,'spares')}>
                {ar?'قطع الغيار':'Spares'}
              </ActionButton>
              <ActionButton primary={isSelected&&mode==='history'} onClick={()=>openAsset(a,'history')}>
                {ar?'السجل':'History'}
              </ActionButton>
            </div>
          </div>

          {isSelected&&<div style={{marginTop:16,display:'grid',gap:14,borderTop:'1px solid #e2e8f0',paddingTop:16}}>

      <Panel title={`${asset.asset_tag} — ${txt(ar?asset.asset_type_ar:asset.asset_type_en)}`}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:10}}>
          <Stat label={ar?'المصنع':'Manufacturer'} value={asset.manufacturer_name}/>
          <Stat label={ar?'الموديل':'Model'} value={asset.model}/>
          <Stat label={ar?'الصيانة القادمة':'Next PPM'} value={nextJob?date(nextJob.due_date):'—'}/>
          <Stat label={ar?'أوامر العمل المفتوحة':'Open WO'} value={openWo}/>
          <Stat label={ar?'شركة الصيانة':'Maintenance Co.'} value={asset.maintenance_company_name}/>
          <Stat label={ar?'العقد':'Contract'} value={asset.contract_number}/>
        </div>
      </Panel>

      {mode==='ppm'&&<Panel title={ar?'PPM من المكتبة للجهاز الحالي':'Library PPM for Current Asset'}>
        <div style={{display:'grid',gap:12}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10}}>
            <Stat label={ar?'المنظمة':'Organization'} value={libraryCtx.organizationName||'—'}/>
            <Stat label={ar?'المشروع الحالي':'Current Project'} value={libraryCtx.projectName||'—'}/>
            <Stat label={ar?'الموقع الحالي':'Current Site'} value={libraryCtx.siteName||asset.site_name||'—'}/>
            <Stat label={ar?'الموديل':'Model'} value={asset.resolved_model||asset.model}/>
          </div>

          {!asset.site_id&&<div className="alert warning">
            {ar?'هذا الجهاز غير مربوط بموقع، لذلك لا يمكن إنشاء PPM من التشغيل.':'This asset is not linked to a site.'}
          </div>}

          {asset.site_id&&!libraryCtx.project?.project_id&&!libraryCtx.loading&&<div className="alert warning">
            {ar?'الموقع الحالي غير مربوط بمشروع. اربط الموقع بالمشروع أولاً.':'Current site is not linked to a project.'}
          </div>}

          <div>
            <h3 style={{marginBottom:8}}>{ar?'قوالب المصنع المطابقة من المكتبة':'Matching OEM Library Templates'}</h3>
            {libraryCtx.loading
              ?<div className="muted">{ar?'جاري فحص المكتبة...':'Checking library...'}</div>
              :libraryCtx.templates.length
                ?<div style={{display:'grid',gap:8}}>
                  {libraryCtx.templates.map(t=><div key={t.id} style={{border:'1px solid #dbe3ee',borderRadius:10,padding:10}}>
                    <div style={{fontWeight:800}}>
                      {ar?(t.title_ar||t.title_en):(t.title_en||t.title_ar)}
                    </div>
                    <div className="muted">
                      {t.frequency||'—'} · {t.estimated_minutes||60} min
                    </div>
                  </div>)}
                </div>
                :<div className="alert warning">
                  {ar?'لا يوجد قالب PPM مطابق في المكتبة لهذا الجهاز.':'No matching PPM template exists in the library for this asset.'}
                </div>}
          </div>

          <div className="row-actions">
            <button
              className="btn"
              disabled={busy||libraryCtx.loading}
              onClick={prepareLibraryPPM}
            >
              {ar?'اعتماد/تحديث PPM من المكتبة':'Adopt / Refresh PPM from Library'}
            </button>
          </div>

          <div>
            <h3 style={{marginBottom:8}}>{ar?'إجراءات PPM الرسمية المتاحة':'Available Official PPM Procedures'}</h3>
            {libraryCtx.procedures.length
              ?<div style={{display:'grid',gap:8}}>
                {libraryCtx.procedures.map(p=><div key={p.id} style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',border:'1px solid #dbe3ee',borderRadius:10,padding:10}}>
                  <div>
                    <div style={{fontWeight:800}}>
                      {ar?(p.name_ar||p.name_en):(p.name_en||p.name_ar)}
                    </div>
                    <div className="muted">{p.frequency||'—'}</div>
                  </div>
                  <button
                    className="btn primary"
                    disabled={busy||!asset.site_id||!libraryCtx.project?.project_id}
                    onClick={()=>createOfficialPlan(p.id)}
                  >
                    {ar?'إنشاء الخطة الرسمية':'Create Official Plan'}
                  </button>
                </div>)}
              </div>
              :<div className="muted">
                {ar?'لا يوجد إجراء رسمي بعد. اضغط اعتماد/تحديث PPM من المكتبة أولاً.':'No official procedure yet. Adopt from library first.'}
              </div>}
          </div>
        </div>
      </Panel>}

      {mode==='ppm-jobs'&&<Panel title={ar?'مهام الصيانة الوقائية':'PPM Jobs'}>
        <div className="form-grid">
          <Field label={ar?'المهمة':'Job'}>
            <select value={ppm.job_id} onChange={e=>setPpm({...ppm,job_id:e.target.value})}>
              <option value="">{ar?'اختر':'Select'}</option>
              {jobs.filter(j=>!j.assigned_to).map(j=>
                <option key={j.id} value={j.id}>
                  {j.job_number} — {date(j.due_date)}
                </option>
              )}
            </select>
          </Field>

          <Field label={ar?'الفني':'Technician'}>
            <select value={ppm.user_id} onChange={e=>setPpm({...ppm,user_id:e.target.value})}>
              <option value="">{ar?'اختر':'Select'}</option>
              {staff.map((s,i)=>{
                const id=s.user_id||s.id
                return id
                  ?<option key={id||i} value={id}>{s.full_name||s.name||s.email||id}</option>
                  :null
              })}
            </select>
          </Field>
        </div>

        <button
          className="btn primary"
          disabled={busy||!ppm.job_id||!ppm.user_id}
          onClick={doAssign}
        >
          {ar?'إسناد + إنشاء أمر العمل':'Assign + Create Work Order'}
        </button>
      </Panel>}

      {mode==='fault'&&<Panel title={ar?'بلاغ عطل':'Fault Request'}>
        <div className="form-grid">
          <Field label={ar?'العنوان':'Title'}>
            <input value={fault.title} onChange={e=>setFault({...fault,title:e.target.value})}/>
          </Field>

          <Field label={ar?'الأولوية':'Priority'}>
            <select value={fault.priority} onChange={e=>setFault({...fault,priority:e.target.value})}>
              {['P1','P2','P3','P4'].map(x=><option key={x}>{x}</option>)}
            </select>
          </Field>

          <Field label={ar?'الوصف':'Description'}>
            <textarea value={fault.description} onChange={e=>setFault({...fault,description:e.target.value})}/>
          </Field>

          <label>
            <input
              type="checkbox"
              checked={fault.create_wo}
              onChange={e=>setFault({...fault,create_wo:e.target.checked})}
            />
            {' '}
            {ar?'إنشاء أمر عمل مباشرة':'Create work order immediately'}
          </label>
        </div>

        <button className="btn primary" disabled={busy||!fault.title} onClick={doFault}>
          {ar?'إنشاء البلاغ':'Create Fault'}
        </button>
      </Panel>}

      {mode==='wo'&&<Panel title={ar?'أمر عمل مباشر':'Direct Work Order'}>
        <div className="form-grid">
          <Field label={ar?'العنوان':'Title'}>
            <input value={wo.title} onChange={e=>setWo({...wo,title:e.target.value})}/>
          </Field>

          <Field label={ar?'الأولوية':'Priority'}>
            <select value={wo.priority} onChange={e=>setWo({...wo,priority:e.target.value})}>
              {['P1','P2','P3','P4'].map(x=><option key={x}>{x}</option>)}
            </select>
          </Field>

          <Field label={ar?'الوصف':'Description'}>
            <textarea value={wo.description} onChange={e=>setWo({...wo,description:e.target.value})}/>
          </Field>
        </div>

        <button className="btn primary" disabled={busy||!wo.title} onClick={doWO}>
          {ar?'إنشاء أمر العمل':'Create Work Order'}
        </button>
      </Panel>}

      {mode==='spares'&&<Panel title={ar?'قطع الغيار':'Spare Parts'}>
        <div className="row-actions" style={{marginBottom:12}}>
          <button className="btn primary" onClick={()=>nav('/inventory')}>
            {ar?'طلب / صرف قطعة':'Request / Issue Part'}
          </button>
          <button className="btn" onClick={()=>nav('/advanced-stock')}>
            {ar?'المخزون المتقدم':'Advanced Stock'}
          </button>
        </div>

        <table className="facility-table">
          <thead>
            <tr>
              <th>{ar?'المرجع':'Reference'}</th>
              <th>{ar?'النوع':'Type'}</th>
              <th>{ar?'الكمية':'Qty'}</th>
              <th>{ar?'التاريخ':'Date'}</th>
            </tr>
          </thead>
          <tbody>
            {spares.length
              ?spares.map((s,i)=><tr key={s.id||i}>
                  <td>{txt(s.part_number||s.reference||s.id)}</td>
                  <td>{txt(s.movement_type||s.type||s.status)}</td>
                  <td>{txt(s.quantity||s.qty)}</td>
                  <td>{date(s.created_at||s.moved_at)}</td>
                </tr>)
              :<tr><td colSpan="4">—</td></tr>}
          </tbody>
        </table>
      </Panel>}

      {mode==='history'&&<Panel title={ar?'السجل التشغيلي':'Operational History'}>
        <div style={{display:'grid',gap:18}}>
          <div>
            <h3>PPM</h3>
            <table className="facility-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>{ar?'الاستحقاق':'Due'}</th>
                  <th>{ar?'الحالة':'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length
                  ?jobs.map(j=><tr key={j.id}>
                      <td>{j.job_number}</td>
                      <td>{date(j.due_date)}</td>
                      <td>{j.status}</td>
                    </tr>)
                  :<tr><td colSpan="3">—</td></tr>}
              </tbody>
            </table>
          </div>

          <div>
            <h3>{ar?'بلاغات الأعطال':'Fault Requests'}</h3>
            <table className="facility-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>{ar?'العنوان':'Title'}</th>
                  <th>{ar?'الحالة':'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {requests.length
                  ?requests.map(r=><tr key={r.id}>
                      <td>{r.request_number}</td>
                      <td>{r.title}</td>
                      <td>{r.status}</td>
                    </tr>)
                  :<tr><td colSpan="3">—</td></tr>}
              </tbody>
            </table>
          </div>

          <div>
            <h3>{ar?'أوامر العمل':'Work Orders'}</h3>
            <table className="facility-table">
              <thead>
                <tr>
                  <th>WO</th>
                  <th>{ar?'العنوان':'Title'}</th>
                  <th>{ar?'الحالة':'Status'}</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.length
                  ?workOrders.map(w=><tr key={w.id}>
                      <td>{w.work_order_number}</td>
                      <td>{w.title}</td>
                      <td>{w.status}</td>
                    </tr>)
                  :<tr><td colSpan="3">—</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>}
          </div>}
        </div>
      })}
    </div>

    <Panel title={ar?'\u0627\u062e\u062a\u064a\u0627\u0631 \u062c\u0647\u0627\u0632 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629':'Choose Device from Library'}>
      <p className="muted">{ar?'\u0627\u062e\u062a\u0631 \u0627\u0644\u062c\u0647\u0627\u0632 \u0644\u062a\u0639\u0628\u0626\u0629 \u0627\u0644\u0646\u0645\u0648\u0630\u062c \u0623\u0639\u0644\u0627\u0647.':'Choose an item to populate the form above.'}</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>
        {(deployCtx.master?.options||[]).filter(o=>o.status!=='archived').map(o=>{
          const type=(deployCtx.master?.types||[]).find(t=>String(t.id)===String(o.asset_type_id))
          const maker=(deployCtx.master?.manufacturers||[]).find(m=>String(m.id)===String(o.manufacturer_id))
          return <button key={o.id} type="button" className="btn" style={{textAlign:ar?'right':'left',height:'auto',minHeight:64,whiteSpace:'normal'}}
            onClick={()=>chooseDeviceFromLibrary(o.asset_type_id,o.manufacturer_id,o.id)}>
            <strong>{ar?(type?.name_ar||type?.name_en):(type?.name_en||type?.name_ar)}</strong>
            <span style={{display:'block',fontSize:12}}>{maker?.short_name||maker?.name||''} - {o.model_family||'-'}</span>
          </button>
        })}
        {!(deployCtx.master?.options||[]).length&&(deployCtx.master?.types||[]).map(t=><button key={t.id} type="button" className="btn"
          onClick={()=>chooseDeviceFromLibrary(t.id)}>{ar?(t.name_ar||t.name_en):(t.name_en||t.name_ar)}</button>)}
      </div>
    </Panel>
  </section>
}
