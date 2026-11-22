import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {frequencies} from '../lib/ppm'
import {useLanguage} from '../i18n/LanguageContext'
import {Field,Select,Notice,FormActions} from './FacilityFields'

export async function medicalOemAction(name,args){
 const {data,error}=await supabase.rpc('bamm_v2_oem_'+name,args)
 if(error)throw error
 return data
}

export default function MedicalOemProcedure({organizationId,onSave,onCancel,busy,setBusy,asset}){
 const {t,lang}=useLanguage(),ar=lang==='ar'
 const [catalog,setCatalog]=useState(null),[error,setError]=useState(''),[templateId,setTemplateId]=useState('')
 const [form,setForm]=useState({project_id:'',type_id:'',manufacturer_id:'',model:asset?.model||'',name_ar:'',name_en:'',document_title:'',document_revision:'',frequency_reference:'',source_url:'',frequency:'monthly'})
 const change=(key,value)=>{
  if(['project_id','type_id','manufacturer_id','model'].includes(key))setTemplateId('')
  setForm(f=>({...f,[key]:value}))
 }
 useEffect(()=>{
  let active=true
  async function load(){
   try{
    const [library,projects]=await Promise.all([
     supabase.rpc('bamm_v2_medical_library'),
     supabase.from('bf35_projects').select('id,name').eq('organization_id',organizationId).eq('status','active')
    ])
    if(library.error)throw library.error
    if(projects.error)throw projects.error
    const manageable=new Set((library.data?.project_capabilities||[]).filter(p=>p.can_manage).map(p=>p.project_id))
    if(active)setCatalog({items:library.data?.items||[],projects:(projects.data||[]).filter(p=>manageable.has(p.id))})
   }catch(e){if(active)setError(e.message)}
  }
  if(organizationId)load()
  return()=>{active=false}
 },[organizationId])
 const options=kind=>(catalog?.items||[]).filter(x=>x.kind===kind&&x.status==='active').map(x=>({value:x.id,label:ar?x.name_ar:x.name_en}))
 const normalized=v=>String(v||'').trim().toLowerCase()
 const matchingTemplates=(catalog?.items||[]).filter(x=>x.kind==='template'&&x.selectable&&x.frequency_basis==='calendar'
   &&[1,3,6,12].includes(Number(x.interval_months))&&x.type_id===form.type_id&&x.manufacturer_id===form.manufacturer_id
   &&!!form.model.trim()&&normalized(x.model_family)===normalized(form.model))
 async function importTemplate(){
  if(busy||!form.project_id||!matchingTemplates.some(item=>item.id===templateId))return
  setBusy(true);setError('')
  try{
   const {error}=await supabase.rpc('bamm_v2_select_library',{p_project:form.project_id,p_items:[{kind:'template',id:templateId}],p_selected:true})
   if(error)throw error
   const {data,error:importError}=await supabase.rpc('bamm_v2_import_project_template',{p_project:form.project_id,p_template:templateId})
   if(importError)throw importError
   onSave(data.id)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function submit(e){
  e.preventDefault()
  if(busy||!catalog?.projects.length)return
  setBusy(true);setError('')
  try{
   const result=await medicalOemAction('create',{p_data:{...form,source_kind:'url',frequency_basis:'calendar'}})
   onSave(result.procedure_id)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <form className="facility-form" onSubmit={submit}>
  <Notice error={error}/>
  {!catalog&&!error&&<p role="status">{t('loading')}</p>}
  {catalog&&!catalog.projects.length&&<p role="status">{ar?'يلزم إسناد صلاحية إعداد إجراءات المصنع في مشروع طبي.':'An assigned medical project with OEM authoring permission is required.'}</p>}
  {catalog?.projects.length>0&&<div className="form-grid">
   <Field label={ar?'المشروع':'Project'} required><Select required value={form.project_id} onChange={v=>change('project_id',v)} options={catalog.projects.map(p=>({value:p.id,label:p.name}))}/></Field>
   <Field label={ar?'نوع الجهاز':'Device type'} required><Select required value={form.type_id} onChange={v=>change('type_id',v)} options={options('type')}/></Field>
   <Field label={t('manufacturer')} required><Select required value={form.manufacturer_id} onChange={v=>change('manufacturer_id',v)} options={options('manufacturer')}/></Field>
   <Field label={t('model')} required><input required value={form.model} onChange={e=>change('model',e.target.value)}/></Field>
   {form.type_id&&form.manufacturer_id&&form.model.trim()&&<div className="span-2">
    <Field label={ar?'قوالب المصنع المطابقة':'Matching manufacturer templates'}>
     <Select value={templateId} onChange={setTemplateId} disabled={!matchingTemplates.length} options={matchingTemplates.map(x=>({value:x.id,label:ar?x.name_ar:x.name_en}))}/>
    </Field>
    {matchingTemplates.length
     ?<button type="button" className="btn secondary" disabled={busy||!form.project_id||!templateId} onClick={importTemplate}>{ar?'استيراد قالب المصنع إلى مكتبة الإجراءات':'Import manufacturer template to the procedure library'}</button>
     :<p className="muted">{ar?'لا يوجد قالب موثّق مطابق. أكمل البيانات أدناه لإضافة الإجراء من دليل المصنع.':'No matching verified template. Enter the details below to add the procedure from the manufacturer manual.'}</p>}
   </div>}
   {[
    ['name_ar',t('nameAr')],['name_en',t('nameEn')],
    ['document_title',ar?'اسم دليل المصنع':'Manufacturer manual title'],
    ['document_revision',ar?'إصدار الدليل':'Manual revision'],
    ['frequency_reference',ar?'صفحة أو قسم الدورية في الدليل':'Manual page or section for the interval'],
    ['source_url',ar?'الرابط الرسمي لدليل المصنع':'Official manufacturer manual URL']
   ].map(([key,label])=><Field key={key} label={label} required>
    <input required type={key==='source_url'?'url':'text'} value={form[key]} onChange={e=>change(key,e.target.value)}/>
   </Field>)}
   <Field label={t('frequency')} required><Select required value={form.frequency} onChange={v=>change('frequency',v)} options={frequencies.map(f=>({value:f,label:t(f)}))}/></Field>
   <p className="muted span-2">{ar?'بعد الحفظ أضف خطوات الدليل ومرجع كل خطوة، ثم يراجع المصدر مستخدم مخوّل آخر.':'After saving, enter the manual’s steps with a reference for each. Another authorized user reviews the source.'}</p>
  </div>}
  <FormActions busy={busy} disabled={!catalog?.projects.length} onCancel={()=>!busy&&onCancel()}/>
 </form>
}
