export function setupErrorMessage(error,lang='ar'){
 const ar=lang==='ar'
 if(error?.code==='42501'||/permission|not authorized|access denied/i.test(error?.message||''))return ar?'لا تتوفر صلاحية قراءة هذه البيانات للشركة المختارة.':'You do not have permission to read this company’s setup data.'
 const message=typeof error==='string'?error:typeof error?.message==='string'?error.message:''
 return message&&message!=='[object Object]'?message:(ar?'تعذر تحميل بيانات الإعداد. أعد المحاولة.':'Setup data could not be loaded. Please try again.')
}
export function setupNextStep({project,sites,assets,team,ppm}){
 if(!project)return 0
 if(!sites||assets===null||assets===0)return 1
 if(team===null||!team||ppm===null||!ppm)return 2
 return null
}
export function setupProjectScope(structure,projectId){
 const project=(structure.projects||[]).find(p=>p.id===projectId)
 if(!project)return {project:null,siteIds:[],members:[]}
 const siteIds=[...new Set((project.sites||[]).map(s=>s.site_id||s.id).filter(Boolean))]
 const members=(structure.teams||[]).filter(t=>t.project_id===projectId&&!['archived','inactive','cancelled'].includes(t.status)).flatMap(t=>t.members||[]).filter(m=>m.is_active!==false)
 return {project,siteIds,members:[...new Map(members.map(m=>[m.user_id,m])).values()]}
}
