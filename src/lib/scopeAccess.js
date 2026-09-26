const CLIENT_VIEW_PERMISSIONS=new Set([
 'clients.view','contracts.view','sites.view','locations.view',
 'assets.view','corrective.view','corrective.request'
])

const activeNow=s=>{
 if(!s)return false
 if(s.active===false||s.is_active===false)return false
 const now=Date.now()
 const from=s.valid_from?Date.parse(s.valid_from):null
 const until=s.valid_until?Date.parse(s.valid_until):null
 if(Number.isFinite(from)&&now<from)return false
 if(Number.isFinite(until)&&now>until)return false
 return true
}

const same=(a,b)=>!b||String(a||'')===String(b)

export function scopeMatches(scope,ctx={}){
 if(!activeNow(scope))return false
 if(!same(scope.organization_id,ctx.organization_id))return false
 if(!same(scope.client_id,ctx.client_id))return false
 if(!same(scope.contract_id,ctx.contract_id))return false
 if(!same(scope.project_id,ctx.project_id))return false
 if(!same(scope.site_id,ctx.site_id))return false
 if(!same(scope.team_id,ctx.team_id))return false
 if(!same(scope.discipline_code,ctx.discipline_code))return false
 if(!same(scope.user_id,ctx.user_id))return false
 return true
}

export function normalizeScopeContext(org=null,client=null,scope=null){
 if(scope&&typeof scope==='object'){
  return {
   organization_id:scope.organization_id||org||null,
   client_id:scope.client_id||client||null,
   contract_id:scope.contract_id||null,
   project_id:scope.project_id||null,
   site_id:scope.site_id||null,
   team_id:scope.team_id||null,
   discipline_code:scope.discipline_code||null,
   user_id:scope.user_id||null
  }
 }
 return {organization_id:org||null,client_id:client||null}
}

export function evaluateAccess({profile,access,permission,org=null,client=null,scope=null}){
 if(profile?.status!=='active')return false
 if(access?.super_admin)return true

 const ctx=normalizeScopeContext(org,client,scope)

 const roleAllowed=(access?.roles||[]).some(r=>
  r.permission===permission&&(!ctx.organization_id||r.organization_id===ctx.organization_id)
 )

 if(!roleAllowed){
  if(!ctx.organization_id&&!ctx.client_id&&CLIENT_VIEW_PERMISSIONS.has(permission)&&(access?.clients||[]).length)return true
  if(ctx.client_id&&CLIENT_VIEW_PERMISSIONS.has(permission)){
   return (access?.clients||[]).some(c=>
    c.client_id===ctx.client_id&&(!ctx.organization_id||c.organization_id===ctx.organization_id)
   )
  }
  return false
 }

 const deepScoped=!!(
  ctx.contract_id||ctx.project_id||ctx.site_id||ctx.team_id||
  ctx.discipline_code||ctx.user_id
 )

 if(!deepScoped)return true

 const scopes=Array.isArray(access?.scopes)?access.scopes:[]
 if(!scopes.length)return true

 return scopes.some(s=>scopeMatches(s,ctx))
}

export const scopePolicy={
 owner:['view','approve','report'],
 maintenance_admin:['view','manage','approve','assign','report'],
 project_manager:['view','manage','approve','assign','report'],
 site_manager:['view','manage','assign','report'],
 staff_technician:['view','execute']
}