import {supabase} from './supabaseClient'

export const MASTER_TABLES={
 organizations:'bf_organizations',
 clients:'bf_clients',
 contracts:'bf_contracts',
 sites:'bf_sites'
}

export async function readMaster(key){
 const table=MASTER_TABLES[key]
 if(!table)throw Error('Unknown master table')
 const rows=[]
 for(let start=0;start<100000;start+=500){
  const {data,error}=await supabase.from(table).select('*')
   .order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+499)
  if(error)throw error
  rows.push(...(data||[]))
  if((data||[]).length<500)return rows
 }
 throw Error('Too many records. Server-side pagination is required.')
}

export async function readMasterBundle(){
 const keys=Object.keys(MASTER_TABLES)
 const values=await Promise.all(keys.map(readMaster))
 return Object.fromEntries(keys.map((key,i)=>[key,values[i]]))
}

export function normalizeMaster(key,form){
 const fields={
  organizations:['name','code','status'],
  clients:['organization_id','name','code','email','phone','status'],
  contracts:['organization_id','client_id','contract_number','contract_type','start_date','end_date','contract_value','status'],
  sites:['organization_id','client_id','contract_id','name','code','city','address','latitude','longitude','location_source','status']
 }
 const p=Object.fromEntries(fields[key].map(k=>[k,form[k]??null]))

 if(key==='clients'){
  if(!form.organization_id)throw Error('Organization is required')
  p.tenant_id=form.organization_id
 }

 delete p.code
 for(const k of Object.keys(p))if(p[k]==='')p[k]=null

 if(key==='organizations')p.name=String(form.name||'').trim()
 if(key==='clients'||key==='sites')p.name=String(form.name||'').trim()

 if(key==='contracts'){
  if(p.contract_value!==null&&p.contract_value!==undefined)p.contract_value=Number(p.contract_value)
  if(p.contract_value!==null&&(!Number.isFinite(p.contract_value)||p.contract_value<0))throw Error('Invalid contract value')
 }

 if(key==='clients'||key==='contracts'||key==='sites'){
  if(!p.organization_id)throw Error('Organization is required')
 }
 if(key==='contracts'||key==='sites'){
  if(!p.client_id)throw Error('Client is required')
 }

 return p
}

export async function writeMaster(key,form,id){
 const table=MASTER_TABLES[key]
 if(!table)throw Error('Unknown master table')
 const payload=normalizeMaster(key,form)

 if(key==='clients'){
  const {error:tenantError}=await supabase.rpc('bf_med_ensure_org_tenant',{
   p_org:payload.organization_id
  })
  if(tenantError)throw tenantError
 }

 if(key==='contracts'){
  const {data,error}=await supabase.rpc('bf_med_save_contract',{
   p_id:id||null,
   p_org:payload.organization_id,
   p_client:payload.client_id,
   p_contract_number:payload.contract_number||null,
   p_contract_type:payload.contract_type||null,
   p_start_date:payload.start_date||null,
   p_end_date:payload.end_date||null,
   p_contract_value:payload.contract_value??0,
   p_status:payload.status||'active'
  })
  if(error)throw error
  return data
 }

 const q=id
  ?supabase.from(table).update(payload).eq('id',id)
  :supabase.from(table).insert(payload)

 const {data,error}=await q.select('*').single()
 if(error)throw error
 return data
}

export function applyMasterRow(rows,row){
 return [row,...rows.filter(r=>r.id!==row.id)].sort((a,b)=>
  String(b.created_at||'').localeCompare(String(a.created_at||''))||
  String(b.id).localeCompare(String(a.id)))
}

export const isActive=r=>r.status!=='archived'

export function labelFor(rows,id,field='name'){
 return rows.find(r=>r.id===id)?.[field]||'—'
}
