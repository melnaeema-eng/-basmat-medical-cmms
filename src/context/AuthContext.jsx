import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {resolveMedicalPermission} from '../lib/medicalPermissionAliases'

const Context=createContext(null)
const empty={super_admin:false,organizations:[],roles:[],role_assignments:[],projects:[],permissions:[]}

export function AuthProvider({children}){
 const [session,setSession]=useState(null)
 const [profile,setProfile]=useState(null)
 const [access,setAccess]=useState(empty)
 const [loading,setLoading]=useState(true)

 async function readAccess(userId){
  const [p,a]=await Promise.all([
   supabase.from('bf_profiles').select('id,full_name,email,status,is_super_admin').eq('id',userId).maybeSingle(),
   supabase.rpc('bf_acl_my_context')
  ])
  if(p.error)throw p.error
  if(a.error)throw a.error
  const payload=a.data||empty
  return {
   profile:p.data,
   access:{
    ...payload,
    role_assignments:payload.roles||[],
    roles:(payload.permissions||[]).map(x=>({
      organization_id:x.organization_id,
      permission:x.permission_key
    })),
    organizations:payload.organizations||[],
    projects:payload.projects||[],
    permissions:payload.permissions||[]
   }
  }
 }

 useEffect(()=>{
  let active=true,seq=0
  async function load(next){
   const n=++seq
   setSession(next)
   if(!next?.user){
    setProfile(null);setAccess(empty);setLoading(false);return
   }
   try{
    const result=await readAccess(next.user.id)
    if(active&&n===seq){
      setProfile(result.profile)
      setAccess(result.access)
    }
   }catch(e){
    console.error('ACL load failed',e)
    if(active&&n===seq){
      setProfile(null)
      setAccess(empty)
    }
   }finally{
    if(active&&n===seq)setLoading(false)
   }
  }

  supabase.auth.getSession().then(({data})=>{if(active)load(data.session)})
  const {data:sub}=supabase.auth.onAuthStateChange((_event,next)=>{if(active)load(next)})
  return()=>{active=false;sub.subscription.unsubscribe()}
 },[])

 const can=(permission,org=null)=>{
  if(profile?.status!=='active')return false
  if(profile?.is_super_admin||access?.super_admin)return true
  const resolved=resolveMedicalPermission(permission)
  return (access?.permissions||[]).some(x=>
    x.permission_key===resolved&&(!org||x.organization_id===org)
  )
 }

 const canScoped=(permission,scope={})=>{
  if(!can(permission,scope.organization_id||null))return false
  if(profile?.is_super_admin||access?.super_admin)return true
  if(!scope.project_id&&!scope.site_id&&!scope.discipline_code)return true

  return (access?.projects||[]).some(p=>
    (!scope.organization_id||p.organization_id===scope.organization_id)&&
    (!scope.project_id||p.project_id===scope.project_id)&&
    (!scope.site_id||!p.site_id||p.site_id===scope.site_id)&&
    (!scope.discipline_code||!p.discipline_code||p.discipline_code===scope.discipline_code)
  )
 }

 const refreshProfile=async()=>{
  if(!session?.user?.id)return
  const result=await readAccess(session.user.id)
  setProfile(result.profile)
  setAccess(result.access)
 }

 const value=useMemo(()=>({
  session,
  user:session?.user||null,
  profile,
  access,
  loading,
  can,
  canScoped,
  signIn:(email,password)=>supabase.auth.signInWithPassword({email,password}),
  signOut:()=>supabase.auth.signOut(),
  refreshProfile
 }),[session,profile,access,loading])

 return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAuth(){
 const v=useContext(Context)
 if(!v)throw Error('AuthProvider missing')
 return v
}
