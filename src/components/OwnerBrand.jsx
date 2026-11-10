import {useEffect,useState} from 'react'
import {loadOwnerIdentity} from '../lib/ownerIdentity'
import {ownerLogoSource} from '../lib/ownerLogo'

export function useOwnerIdentity(scope){
 const key=JSON.stringify(scope),[state,setState]=useState({key:'',identity:null})
 useEffect(()=>{let alive=true;loadOwnerIdentity(JSON.parse(key)).then(identity=>{if(alive)setState({key,identity})}).catch(()=>{if(alive)setState({key,identity:null})});return()=>{alive=false}},[key])
 return state.key===key?state.identity:null
}

export default function OwnerBrand({identity,lang='en',compact=false,label}){
 if(!identity)return null
 const logo=ownerLogoSource(identity.logo_url)
 return <div className="owner-brand" style={{display:'flex',alignItems:'center',gap:compact?4:10,breakInside:'avoid',minWidth:0}}>
  {logo&&<img src={logo} alt={lang==='ar'?'شعار '+identity.name:identity.name+' logo'} onError={e=>{e.currentTarget.style.display='none'}} style={{width:compact?'12mm':72,height:compact?'8mm':58,maxWidth:compact?'12mm':100,objectFit:'contain',flexShrink:0}}/>}
  <div style={{minWidth:0,fontSize:compact?9:14,overflowWrap:'anywhere'}}><small>{label||(lang==='ar'?'المالك':'Owner')}</small><div style={{fontWeight:700}}>{identity.name}</div></div>
 </div>
}
