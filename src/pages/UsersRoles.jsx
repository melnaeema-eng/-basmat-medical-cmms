import {useEffect,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {useAuth} from '../context/AuthContext'
import {useLanguage} from '../i18n/LanguageContext'
import {Field,Choice,Select,Dialog,Notice,FormActions} from '../components/FacilityFields'
import DataTable from '../components/DataTable'
export default function UsersRoles(){
 const {can,access}=useAuth(),{t,lang}=useLanguage()
 const [data,setData]=useState({profiles:[],organizations:[],clients:[],roles:[],memberships:[],clientAccess:[]})
 const [error,setError]=useState(''),[success,setSuccess]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false)
 const [form,setForm]=useState({user_id:'',organization_id:'',role_id:'',client_id:''})
 const load=async()=>{
  try{const defs=[['profiles','bf_profiles'],['organizations','bf_organizations'],['clients','bf_clients'],['roles','bf_roles'],['memberships','bf_user_roles'],['clientAccess','bf_client_access']]
   const rows=await Promise.all(defs.map(async([key,table])=>{const {data,error}=await supabase.from(table).select('*');if(error)throw error;return [key,data||[]]}))
   setData(Object.fromEntries(rows))
  }catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[])
 const assign=async e=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   if(!can('users.manage',form.organization_id))throw Error(t('noPermission'))
   const role=data.roles.find(r=>r.id===form.role_id)
   const {error}=await supabase.rpc('bf3_assign_role',{p_user:form.user_id,p_org:form.organization_id,p_role:form.role_id,p_client:['client_admin','client_user'].includes(role?.code)?form.client_id:null})
   if(error)throw error;setOpen(false);await load();setSuccess(t('saved'))
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const start=user=>{setForm({user_id:user.id,organization_id:'',role_id:'',client_id:''});setOpen(true)}
 const role=data.roles.find(r=>r.id===form.role_id),isClient=['client_admin','client_user'].includes(role?.code)
 const memberships=user=>[
  ...data.memberships.filter(m=>m.user_id===user.id).map(m=>({org:m.organization_id,label:data.roles.find(r=>r.id===m.role_id)?.name||'—'})),
  ...data.clientAccess.filter(m=>m.user_id===user.id).map(m=>({org:m.organization_id,label:(data.clients.find(c=>c.id===m.client_id)?.name||'—')+' · '+m.role_code}))
 ].map(m=>m.label).join(', ')||'—'
 const cols=[{key:'full_name',label:t('fullName'),render:r=>r.full_name||'—'},{key:'email',label:t('email')},{key:'role',label:t('role'),render:memberships},{key:'status',label:t('status'),render:r=>t(r.status)},{key:'actions',label:t('actions'),render:r=>can('users.manage')&&<button className="btn xs secondary" onClick={()=>start(r)}>{t('assignRole')}</button>}]
 return <section className="facility-module"><div className="page-head"><div><h1>{t('usersRoles')}</h1><p>{t('roleScope')}</p></div><button className="btn secondary" onClick={load}>{t('refresh')}</button></div>
  <Notice error={error} success={success}/><DataTable columns={cols} rows={data.profiles} emptyText={t('noData')}/>
  <Dialog open={open} title={t('assignRole')} onClose={()=>setOpen(false)}>
   <form className="form-grid" onSubmit={assign}>
    <Field label={t('user')}><input disabled value={data.profiles.find(p=>p.id===form.user_id)?.email||''}/></Field>
    <Field label={t('organization')} required><Choice required rows={data.organizations.filter(o=>can('users.manage',o.id))} lang={lang} value={form.organization_id} onChange={v=>setForm({...form,organization_id:v,role_id:'',client_id:''})}/></Field>
    <Field label={t('role')} required><Select required value={form.role_id} onChange={v=>setForm({...form,role_id:v,client_id:''})} options={data.roles.filter(r=>(!r.organization_id||r.organization_id===form.organization_id)&&(!r.is_system||r.code!=='company_admin'||access.super_admin)).map(r=>({value:r.id,label:r.name}))}/></Field>
    {isClient&&<Field label={t('client')} required><Choice required rows={data.clients.filter(c=>c.organization_id===form.organization_id)} lang={lang} value={form.client_id} onChange={v=>setForm({...form,client_id:v})}/></Field>}
    <FormActions busy={busy} onCancel={()=>setOpen(false)}/>
   </form>
  </Dialog>
 </section>
}
