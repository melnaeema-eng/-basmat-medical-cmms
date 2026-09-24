import {createContext,useContext,useEffect,useMemo,useState} from 'react'
import {supabase} from '../lib/supabaseClient'
const Context=createContext(null)
const empty={super_admin:false,roles:[],clients:[]}
export function AuthProvider({children}){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[access,setAccess]=useState(empty),[loading,setLoading]=useState(true)
 useEffect(()=>{
  let active=true,seq=0
  async function load(next){
   const n=++seq
   setSession(next)
   if(!next?.user){setProfile(null);setAccess(empty);setLoading(false);return}
   try{
    const [p,a]=await Promise.all([
     supabase.from('bf_profiles').select('id,full_name,email,status,is_super_admin').eq('id',next.user.id).maybeSingle(),
     supabase.rpc('bf3_my_access')])
    if(p.error)throw p.error;if(a.error)throw a.error
    if(active&&n===seq){setProfile(p.data);setAccess(a.data||empty)}
   }catch{if(active&&n===seq){setProfile(null);setAccess(empty)}}
   finally{if(active&&n===seq)setLoading(false)}
  }
  supabase.auth.getSession().then(({data})=>{if(active)load(data.session)})
  const {data:sub}=supabase.auth.onAuthStateChange((_event,next)=>{if(active)load(next)})
  return()=>{active=false;sub.subscription.unsubscribe()}
 },[])
 const can=(permission,org=null,client=null)=>{
  if(profile?.status!=='active')return false
  if(access.super_admin)return true
  if(!org&&!client&&['organizations.view','clients.view','contracts.view','sites.view','locations.view','assets.view','corrective.view','corrective.request'].includes(permission)&&access.clients.length)return true
  if(access.roles.some(r=>r.permission===permission&&(!org||r.organization_id===org)))return true
  return !!client&&['clients.view','contracts.view','sites.view','locations.view','assets.view','corrective.view','corrective.request'].includes(permission)
   &&access.clients.some(c=>c.client_id===client&&(!org||c.organization_id===org))
 }
 const value=useMemo(()=>({
  session,user:session?.user||null,profile,access,loading,can,
  signIn:(email,password)=>supabase.auth.signInWithPassword({email,password}),
  signOut:()=>supabase.auth.signOut(),
  refreshProfile:async()=>{const [p,a]=await Promise.all([
   supabase.from('bf_profiles').select('id,full_name,email,status,is_super_admin').eq('id',session?.user?.id).maybeSingle(),
   supabase.rpc('bf3_my_access')]);if(!p.error)setProfile(p.data);if(!a.error)setAccess(a.data||empty)}
 }),[session,profile,access,loading])
 return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useAuth(){const v=useContext(Context);if(!v)throw Error('AuthProvider missing');return v}
