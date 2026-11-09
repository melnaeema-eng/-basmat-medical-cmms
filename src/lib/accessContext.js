import {resolveMedicalPermission} from './medicalPermissionAliases.js'

const rows=value=>Array.isArray(value)?value:[]
const active=row=>row&&row.is_active!==false&&row.active!==false&&!['inactive','disabled','archived','suspended'].includes(row.status)
const keyOf=row=>typeof row==='string'?row:row?.permission_key||row?.permission||row?.code
const samePermission=(a,b)=>resolveMedicalPermission(keyOf(a))===resolveMedicalPermission(keyOf(b))
const denied=row=>row?.is_allowed===false||row?.allowed===false||row?.organization_allowed===false||!active(row)

export function normalizeAccessContext(payload={},verified=[]){
  const organizations=rows(payload.organizations).filter(active).map(o=>({...o,id:o.organization_id||o.id,organization_id:o.organization_id||o.id})).filter(o=>o.id)
  const homeId=payload.home_organization_id||payload.home_organization?.organization_id||payload.home_organization?.id
  const home=organizations.find(o=>o.id===homeId)||(organizations.length===1?organizations[0]:null)
  const orgIds=new Set(organizations.map(o=>o.id))
  const source=[...rows(payload.permissions),...rows(payload.roles).filter(r=>r.permission||r.permission_key)]
  const permissions=[]
  for(const row of [...source,...verified]){
    const permission_key=keyOf(row)
    const organization_id=row?.organization_id||home?.id
    if(!permission_key||!organization_id||!orgIds.has(organization_id)||denied(row))continue
    if(source.some(d=>samePermission(d,row)&&denied(d)&&(!d.organization_id||d.organization_id===organization_id)))continue
    permissions.push({...typeof row==='object'?row:{},permission_key,organization_id})
  }
  const unique=[...new Map(permissions.map(p=>[JSON.stringify([p.organization_id,p.permission_key,p.project_id||null,p.site_id||null,p.discipline_code||null]),p])).values()]
  return {...payload,organizations,home_organization_id:home?.id||null,home_organization:home,
    role_assignments:rows(payload.role_assignments||payload.roles).filter(active),
    roles:unique.map(p=>({...p,permission:p.permission_key})),permissions:unique,
    projects:rows(payload.projects).filter(active)}
}

// Legacy work-order RPCs still use bf_can. Accept only exact server-confirmed
// grants in existing memberships; role names and admin labels never grant access.
export async function loadEffectiveAccess(payload,rpc){
  const normalized=normalizeAccessContext(payload)
  if(payload.super_admin===true||payload.is_super_admin===true)return normalized
  let legacy
  try{legacy=await rpc('bf3_my_access',{})}catch{return normalized}
  if(legacy.error)return normalized
  const orgIds=new Set(normalized.organizations.map(o=>o.id))
  const source=rows(payload.permissions)
  const candidates=[...new Map(rows(legacy.data?.roles).filter(r=>r.permission&&orgIds.has(r.organization_id))
    .filter(r=>!normalized.permissions.some(p=>p.organization_id===r.organization_id&&samePermission(p,r)))
    .filter(r=>!source.some(p=>samePermission(p,r)&&denied(p)&&(!p.organization_id||p.organization_id===r.organization_id)))
    .map(r=>[`${r.organization_id}:${r.permission}`,r])).values()]
  const checked=await Promise.all(candidates.map(async r=>{
    try{
      const result=await rpc('bf_can',{p_org:r.organization_id,p_permission:r.permission})
      return !result.error&&result.data===true?{organization_id:r.organization_id,permission_key:r.permission}:null
    }catch{return null}
  }))
  return normalizeAccessContext(payload,checked.filter(Boolean))
}
