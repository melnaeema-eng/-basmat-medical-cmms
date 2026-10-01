import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
import {evaluateAccess} from '../lib/scopeAccess'

const Context=createContext(null)
const empty={
 super_admin:false,
 home_organization_id:null,
 home_organization:null,
 roles:[],
 clients:[]
}

export function AuthProvider({children}){
 const [session,setSession]=useState(null)
 const [profile,setProfile]=useState(null)
 const [access,setAccess]=useState(empty)
 const [loading,setLoading]=useState(true)

 useEffect(()=>{
  let active=true,seq=0

  async function load(next){
   const n=++seq
   setSession(next)
   if(!next?.user){
    setProfile(null)
    setAccess(empty)
    setLoading(false)
    return
   }
   try{
    const [p,a]=await Promise.all([
     supabase.from('bf_profiles')
      .select('id,full_name,email,status,is_super_admin')
      .eq('id',next.user.id)
      .maybeSingle(),
     supabase.rpc('bf3_my_access')
    ])
    if(p.error)throw p.error
    if(a.error)throw a.error
    if(active&&n===seq){
     setProfile(p.data)
     setAccess({...empty,...(a.data||{})})
    }
   }catch{
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

 const can=(permission,org=null,client=null,scope=null)=>
  evaluateAccess({profile,access,permission,org,client,scope})

 const canScoped=(permission,scope={})=>
  evaluateAccess({
   profile,access,permission,
   org:scope.organization_id||null,
   client:scope.client_id||null,
   scope
  })

 const refreshProfile=async()=>{
  if(!session?.user)return
  const [p,a]=await Promise.all([
   supabase.from('bf_profiles')
    .select('id,full_name,email,status,is_super_admin')
    .eq('id',session.user.id)
    .maybeSingle(),
   supabase.rpc('bf3_my_access')
  ])
  if(!p.error)setProfile(p.data)
  if(!a.error)setAccess({...empty,...(a.data||{})})
 }

 const value=useMemo(()=>({
  session,
  user:session?.user||null,
  profile,
  access,
  loading,
  can,
  canScoped,
  homeOrganizationId:access?.home_organization_id||null,
  homeOrganization:access?.home_organization||null,
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
