// Only use projects returned by the scoped cycle API. Readiness must not hide their owners.
export function statementOwners(projects){return [...new Set(projects.map(p=>p.owner).filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
export function projectsForOwner(projects,owner){return owner?projects.filter(p=>p.owner===owner):[]}
export function statementReady(project){return !!(project?.can_finance&&project.policy?.status==='active')}

export function mergeStatementProjects(cycleProjects,structureProjects,owners,contracts){
 const result=new Map(cycleProjects.map(p=>[p.id,p]))
 for(const p of structureProjects){
  if(result.has(p.id)||['archived','inactive','cancelled','closed'].includes(p.status))continue
  const owner=owners.find(o=>o.id===p.client_id)
  if(!owner?.name)continue
  // Visibility through the existing structure API is not financial authorization.
  result.set(p.id,{id:p.id,name:p.name,owner:owner.name,contract:contracts.find(c=>c.id===p.contract_id)?.contract_number||'',policy:null,can_manage:false,can_activate:false,can_finance:false,setup_required:true})
 }
 return [...result.values()]
}


// Financial authoring and owner activation are separate server-provided capabilities.
export function statementInboxCapabilities(projects){return {canCreate:projects.some(p=>p.can_finance),activationProjects:projects.filter(p=>p.can_activate&&p.policy?.status==='draft')}}
