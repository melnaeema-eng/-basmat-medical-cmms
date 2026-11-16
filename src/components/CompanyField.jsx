import {Children,isValidElement,useEffect,useRef} from 'react'
import {useAuth} from '../context/AuthContext'
import {companyWorkspace,syncCompanyControl} from '../lib/companyWorkspace'

// Both native selects and the shared Choice/Select keep their existing reset handlers.
export default function CompanyField({company=true,label,required,wide,children,...rest}){
 const {access,profile}=useAuth(),scope=companyWorkspace(access,profile)
 const control=Children.toArray(children).find(c=>isValidElement(c)&&typeof c.props.onChange==='function'&&'value' in c.props)
 const callback=useRef(null);callback.current=control?.props.onChange
 const value=control?.props.value,disabled=control?.props.disabled,native=control?.type==='select'
 useEffect(()=>{
  syncCompanyControl(scope,{value,disabled,native,onChange:callback.current},company)
 },[company,scope.isSuperAdmin,scope.companyId,value,disabled,native])
 if(company&&!scope.isSuperAdmin)return null
 return <label {...rest} className={[wide?'span-2':'',rest.className||''].filter(Boolean).join(' ')}>{label!==undefined&&<span>{label}{required?' *':''}</span>}{children}</label>
}

export function CompanyAdminOnly({children}){
 const {access,profile}=useAuth()
 return companyWorkspace(access,profile).isSuperAdmin?children:null
}
